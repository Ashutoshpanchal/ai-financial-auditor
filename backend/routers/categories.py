"""FastAPI router for category management — master dictionary and per-user description mappings."""

from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, status
from langchain_openai import ChatOpenAI
from sqlalchemy import delete, func, or_, select, text, update

from backend.config import Settings, get_settings
from backend.database import get_db, set_rls_user
from backend.middleware.auth import (
    get_current_user,
    get_current_user_or_dev_analyze_bypass,
)
from backend.models.category_master import CategoryMaster
from backend.models.category_rule import CategoryRule
from backend.models.document import Document
from backend.models.transaction import Transaction
from backend.prompts.category_prompt import category_prompt
from backend.services.category_rules_apply import apply_category_rules_to_transactions

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from backend.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/categories", tags=["categories"])


_CHUNK_SIZE = 10  # max descriptions per LLM call to avoid context-window overflow
# Max characters logged per LLM field at INFO (full text at DEBUG).
_LLM_LOG_PREVIEW_CHARS = 4000

PAYMENT_METHODS = [
    "UPI",
    "NEFT",
    "IMPS",
    "Net Banking",
    "Credit Card",
    "Debit Card",
    "Cheque",
    "Auto-debit",
    "Cash",
    "Salary Credit",
    "Other",
]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _build_category_hierarchy(rows: list[CategoryMaster]) -> dict[str, list[str]]:
    """Build a {parent_category: [sub_category, ...]} dict from ORM rows."""
    hierarchy: dict[str, list[str]] = {}
    for row in rows:
        hierarchy.setdefault(row.parent_category, []).append(row.sub_category)
    return hierarchy


def _hierarchy_to_text(hierarchy: dict[str, list[str]]) -> str:
    """Convert category hierarchy dict to a human-readable string for LLM prompts."""
    lines = [f"{parent}: {', '.join(subs)}" for parent, subs in hierarchy.items()]
    return "\n".join(lines)


def _normalize_llm_message_content(content: object) -> str:
    """Flatten LangChain ``AIMessage.content`` (``str`` or list of blocks) to one string."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                if (block.get("type") == "text" and "text" in block) or "text" in block:
                    parts.append(str(block["text"]))
                else:
                    parts.append(str(block))
            else:
                parts.append(str(block))
        return "".join(parts)
    return str(content)


def _parse_llm_json(raw: str) -> list[dict]:
    """Strip optional markdown fences from LLM output and parse as JSON array."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("```", 1)[0]
    return json.loads(cleaned.strip())


def _build_llm(settings: Settings) -> ChatOpenAI:
    """Instantiate a ChatOpenAI client pointed at OpenRouter."""
    return ChatOpenAI(
        model=settings.openrouter_model,
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        temperature=0.1,
    )


def _chunks(lst: list, size: int) -> list[list]:
    """Split a list into chunks of at most `size` elements."""
    return [lst[i : i + size] for i in range(0, len(lst), size)]


def _truncate_for_llm_log(text: str, max_chars: int = _LLM_LOG_PREVIEW_CHARS) -> str:
    """Return text or a prefix plus truncation notice for log lines."""
    if len(text) <= max_chars:
        return text
    return f"{text[:max_chars]}...<truncated {len(text) - max_chars} more chars>"


def _fetch_raw_master_rows(db: Session, user_id: str) -> list[CategoryMaster]:
    """Return global seed rows plus the given user's category_master rows."""
    return list(
        db.execute(
            select(CategoryMaster).where(
                or_(CategoryMaster.user_id.is_(None), CategoryMaster.user_id == user_id)
            )
        )
        .scalars()
        .all()
    )


def _dedupe_master_rows_for_user(
    rows: list[CategoryMaster], user_id: str
) -> list[CategoryMaster]:
    """For each (parent_category, sub_category), prefer the user's row over the global seed."""
    by_key: dict[tuple[str, str], CategoryMaster] = {}
    for row in rows:
        if row.user_id is not None and row.user_id != user_id:
            continue
        key = (row.parent_category, row.sub_category)
        if row.user_id == user_id or key not in by_key:
            by_key[key] = row
    return list(by_key.values())


def _grouped_master_response(rows: list[CategoryMaster]) -> dict[str, list[dict]]:
    """Shape API JSON: parent -> [{id, sub_category, is_global}, ...]."""
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row.parent_category, []).append(
            {
                "id": row.id,
                "sub_category": row.sub_category,
                "is_global": row.user_id is None,
            }
        )
    return grouped


def _normalize_payment(value: object) -> str | None:
    """Return a valid PAYMENT_METHODS label, or None if empty."""
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    if s in PAYMENT_METHODS:
        return s
    return "Other"


def _ensure_user_master_pair(
    db: Session,
    current_user: User,
    parent_category: str,
    sub_category: str,
    allowed: set[tuple[str, str]],
    hierarchy: dict[str, list[str]],
) -> None:
    """Ensure (parent_category, sub_category) exists for this user; extend allowed and hierarchy."""
    key = (parent_category, sub_category)
    if key in allowed:
        return
    existing_own = db.execute(
        select(CategoryMaster).where(
            CategoryMaster.user_id == current_user.id,
            CategoryMaster.parent_category == parent_category,
            CategoryMaster.sub_category == sub_category,
        )
    ).scalar_one_or_none()
    if existing_own is not None:
        allowed.add(key)
        hierarchy.setdefault(parent_category, []).append(sub_category)
        return
    entry = CategoryMaster(
        id=str(uuid.uuid4()),
        parent_category=parent_category,
        sub_category=sub_category,
        user_id=current_user.id,
        updated_by=current_user.id,
    )
    db.add(entry)
    db.flush()
    allowed.add(key)
    subs = hierarchy.setdefault(parent_category, [])
    if sub_category not in subs:
        subs.append(sub_category)


def _resolve_llm_parent_sub(
    item: dict,
    allowed: set[tuple[str, str]],
    hierarchy: dict[str, list[str]],
) -> tuple[str | None, str | None]:
    """Pick parent/sub from LLM output; fall back to first valid pair under same parent, then any."""
    parent = (item.get("parent_category") or "").strip()
    sub = (item.get("sub_category") or "").strip()
    if not parent or not sub:
        return None, None
    if (parent, sub) in allowed:
        return parent, sub
    if parent in hierarchy:
        for cand in hierarchy[parent]:
            if (parent, cand) in allowed:
                return parent, cand
    for ap, subs in hierarchy.items():
        for cand in subs:
            if (ap, cand) in allowed:
                return ap, cand
    if allowed:
        return next(iter(allowed))
    return None, None


# ---------------------------------------------------------------------------
# GET /categories/master
# ---------------------------------------------------------------------------


@router.get("/master")
def list_category_master(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, list[dict]]:
    """Return merged category dictionary for the current user (global seed + user rows).

    For duplicate (parent, sub), the user's row wins. Each sub entry includes
    ``is_global`` so the UI can hide delete on seed rows.
    """
    raw = _fetch_raw_master_rows(db, current_user.id)
    deduped = _dedupe_master_rows_for_user(raw, current_user.id)
    return _grouped_master_response(deduped)


@router.get("/master/split")
def list_category_master_split(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, dict[str, list[dict]]]:
    """Return built-in seed rows, user-defined rows, and merged view for dropdowns.

    * ``builtin`` — only global seed rows (``user_id`` NULL), never merged with overrides.
    * ``user_defined`` — only the current user's ``category_master`` rows.
    * ``merged`` — same shape as ``GET /categories/master`` (user wins on duplicate pairs).
    """
    raw = _fetch_raw_master_rows(db, current_user.id)
    deduped = _dedupe_master_rows_for_user(raw, current_user.id)
    builtin_only = [r for r in raw if r.user_id is None]
    user_only = [r for r in raw if r.user_id == current_user.id]
    return {
        "merged": _grouped_master_response(deduped),
        "builtin": _grouped_master_response(builtin_only),
        "user_defined": _grouped_master_response(user_only),
    }


# ---------------------------------------------------------------------------
# POST /categories/master
# ---------------------------------------------------------------------------


@router.post("/master", status_code=status.HTTP_201_CREATED)
def create_category_master_entry(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Add a user-owned parent/sub pair to category_master.

    Raises 409 if this user already has the same (parent_category, sub_category).
    """
    parent_category: str = body.get("parent_category", "").strip()
    sub_category: str = body.get("sub_category", "").strip()

    if not parent_category or not sub_category:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Both parent_category and sub_category are required.",
        )

    existing_own = db.execute(
        select(CategoryMaster).where(
            CategoryMaster.user_id == current_user.id,
            CategoryMaster.parent_category == parent_category,
            CategoryMaster.sub_category == sub_category,
        )
    ).scalar_one_or_none()

    if existing_own is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Entry '{parent_category} / {sub_category}' already exists for your account.",
        )

    entry = CategoryMaster(
        id=str(uuid.uuid4()),
        parent_category=parent_category,
        sub_category=sub_category,
        user_id=current_user.id,
        updated_by=current_user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    return {
        "id": entry.id,
        "parent_category": entry.parent_category,
        "sub_category": entry.sub_category,
        "created_at": entry.created_at,
        "updated_by": entry.updated_by,
    }


# ---------------------------------------------------------------------------
# PATCH /categories/master/{entry_id}
# ---------------------------------------------------------------------------


@router.patch("/master/{entry_id}")
def update_category_master_entry(
    entry_id: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Rename a user-owned category_master row (new parent and/or sub labels).

    Updates ``category_rules`` rows for this user that used the old
    ``(parent_category, sub_category)`` pair so they keep the renamed labels.
    Seed rows cannot be updated.
    """
    set_rls_user(db, current_user.id)

    entry = db.execute(
        select(CategoryMaster).where(CategoryMaster.id == entry_id)
    ).scalar_one_or_none()

    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category entry '{entry_id}' not found.",
        )

    if entry.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seed dictionary entries cannot be edited.",
        )

    if entry.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit categories you created.",
        )

    raw_parent = body.get("parent_category")
    raw_sub = body.get("sub_category")
    if raw_parent is None or raw_sub is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Both parent_category and sub_category are required.",
        )

    new_parent = str(raw_parent).strip()
    new_sub = str(raw_sub).strip()

    if not new_parent or not new_sub:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="parent_category and sub_category cannot be empty.",
        )

    old_parent = entry.parent_category
    old_sub = entry.sub_category

    if new_parent == old_parent and new_sub == old_sub:
        db.refresh(entry)
        return {
            "id": entry.id,
            "parent_category": entry.parent_category,
            "sub_category": entry.sub_category,
            "updated_by": entry.updated_by,
        }

    duplicate = db.execute(
        select(CategoryMaster).where(
            CategoryMaster.user_id == current_user.id,
            CategoryMaster.parent_category == new_parent,
            CategoryMaster.sub_category == new_sub,
            CategoryMaster.id != entry_id,
        )
    ).scalar_one_or_none()

    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Entry '{new_parent} / {new_sub}' already exists for your account.",
        )

    db.execute(
        update(CategoryRule)
        .where(
            CategoryRule.user_id == current_user.id,
            CategoryRule.parent_category == old_parent,
            CategoryRule.sub_category == old_sub,
        )
        .values(
            parent_category=new_parent,
            sub_category=new_sub,
            updated_at=datetime.now(UTC),
            updated_by=current_user.id,
        )
    )

    entry.parent_category = new_parent
    entry.sub_category = new_sub
    entry.updated_by = current_user.id
    entry.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(entry)

    return {
        "id": entry.id,
        "parent_category": entry.parent_category,
        "sub_category": entry.sub_category,
        "updated_by": entry.updated_by,
    }


# ---------------------------------------------------------------------------
# DELETE /categories/master/{entry_id}
# ---------------------------------------------------------------------------


@router.delete("/master/{entry_id}", status_code=status.HTTP_200_OK)
def delete_category_master_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Delete a user-owned category_master row and remove rules that used that pair.

    Seed rows (``user_id`` NULL) cannot be deleted. User-owned ``category_rules``
    rows whose ``parent_category`` / ``sub_category`` match the deleted master
    entry are deleted so transactions are not left pointing at removed labels.
    """
    set_rls_user(db, current_user.id)

    entry = db.execute(
        select(CategoryMaster).where(CategoryMaster.id == entry_id)
    ).scalar_one_or_none()

    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category entry '{entry_id}' not found.",
        )

    if entry.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seed dictionary entries cannot be deleted.",
        )

    if entry.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete categories you created.",
        )

    db.execute(
        delete(CategoryRule).where(
            CategoryRule.user_id == current_user.id,
            CategoryRule.parent_category == entry.parent_category,
            CategoryRule.sub_category == entry.sub_category,
        )
    )

    db.delete(entry)
    db.commit()
    return {"deleted": entry_id}


# ---------------------------------------------------------------------------
# GET /categories/payment-methods
# ---------------------------------------------------------------------------


@router.get("/payment-methods", response_model=list[str])
def list_payment_methods() -> list[str]:
    """Return the fixed list of allowed payment method labels.

    No authentication required.
    """
    return PAYMENT_METHODS


# ---------------------------------------------------------------------------
# GET /categories/unmapped
# ---------------------------------------------------------------------------


@router.get("/unmapped")
def list_unmapped_short_descriptions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Return distinct short_descriptions that have no matching category_master entry.

    A short_description is considered "mapped" when any category_master row
    (global seed or user-owned) has a sub_category that equals one of the
    hyphen-separated tokens in the short_description (case-insensitive exact
    token match).

    Returns a list of {short_description, txn_count, sample_raw_descriptions}.
    """
    set_rls_user(db, current_user.id)

    # All distinct short_descriptions for this user that have no category_master_id
    unmapped_rows = db.execute(
        select(
            Transaction.short_description,
            func.count().label("txn_count"),
        )
        .where(
            Transaction.user_id == current_user.id,
            Transaction.short_description.isnot(None),
            Transaction.category_master_id.is_(None),
        )
        .group_by(Transaction.short_description)
        .order_by(func.count().desc())
    ).all()

    if not unmapped_rows:
        return []

    # For each unmapped short_description, get up to 3 sample raw descriptions
    result: list[dict] = []
    for row in unmapped_rows:
        sd: str = row.short_description
        samples = (
            db.execute(
                select(Transaction.description)
                .where(
                    Transaction.user_id == current_user.id,
                    Transaction.short_description == sd,
                )
                .limit(3)
            )
            .scalars()
            .all()
        )
        result.append(
            {
                "short_description": sd,
                "txn_count": row.txn_count,
                "sample_raw_descriptions": list(samples),
            }
        )

    return result


# ---------------------------------------------------------------------------
# POST /categories/resolve-unmapped
# ---------------------------------------------------------------------------


@router.post("/resolve-unmapped")
def resolve_unmapped_short_description(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Map an unmapped short_description to a parent/sub category.

    Creates a user-owned category_master entry (if needed), then auto-categorizes
    all transactions with this short_description that currently have no category.
    """
    set_rls_user(db, current_user.id)

    short_description: str = (body.get("short_description") or "").strip()
    parent_category: str = (body.get("parent_category") or "").strip()
    sub_category: str = (body.get("sub_category") or "").strip()

    if not short_description:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="short_description is required.",
        )
    if not parent_category or not sub_category:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Both parent_category and sub_category are required.",
        )

    # Ensure category_master entry exists (user-owned)
    existing_cm = db.execute(
        select(CategoryMaster).where(
            CategoryMaster.user_id == current_user.id,
            CategoryMaster.parent_category == parent_category,
            CategoryMaster.sub_category == sub_category,
        )
    ).scalar_one_or_none()

    if existing_cm is None:
        existing_cm = CategoryMaster(
            id=str(uuid.uuid4()),
            parent_category=parent_category,
            sub_category=sub_category,
            user_id=current_user.id,
            updated_by=current_user.id,
        )
        db.add(existing_cm)
        db.flush()

    cm_id: str = existing_cm.id

    # Auto-categorize all unmapped transactions with this short_description
    updated = (
        db.execute(
            update(Transaction)
            .where(
                Transaction.user_id == current_user.id,
                Transaction.short_description == short_description,
                Transaction.category_master_id.is_(None),
            )
            .values(
                category=f"{parent_category} / {sub_category}",
                parent_category=parent_category,
                sub_category=sub_category,
                category_master_id=cm_id,
            )
        )
    ).rowcount

    db.commit()
    return {
        "short_description": short_description,
        "parent_category": parent_category,
        "sub_category": sub_category,
        "categorized_count": updated,
    }


# ---------------------------------------------------------------------------
# GET /categories/descriptions
# ---------------------------------------------------------------------------


@router.get("/unmatched-summary")
def get_unmatched_category_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return counts of transactions with no category (for Upload nudges)."""
    set_rls_user(db, current_user.id)
    txn_count = (
        db.execute(
            select(func.count())
            .select_from(Transaction)
            .where(
                Transaction.user_id == current_user.id,
                Transaction.category.is_(None),
            )
        ).scalar()
        or 0
    )
    distinct_desc = (
        db.execute(
            select(func.count(func.distinct(Transaction.description))).where(
                Transaction.user_id == current_user.id,
                Transaction.category.is_(None),
            )
        ).scalar()
        or 0
    )
    return {
        "uncategorized_transaction_count": int(txn_count),
        "distinct_uncategorized_descriptions": int(distinct_desc),
    }


def _serialize_category_rule(r: CategoryRule) -> dict:
    """Shape one category_rule row for API JSON."""
    return {
        "id": r.id,
        "user_id": r.user_id,
        "pattern": r.pattern,
        "description": r.pattern,
        "match_type": r.match_type,
        "priority": r.priority,
        "enabled": r.enabled,
        "parent_category": r.parent_category,
        "sub_category": r.sub_category,
        "payment_method": r.payment_method,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
        "updated_by": r.updated_by,
    }


@router.get("/rules")
def list_category_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Return all category_rules rows owned by the current user."""
    set_rls_user(db, current_user.id)
    rows = (
        db.execute(select(CategoryRule).where(CategoryRule.user_id == current_user.id))
        .scalars()
        .all()
    )
    return [_serialize_category_rule(r) for r in rows]


@router.get("/descriptions")
def list_description_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Backward-compatible alias for ``GET /categories/rules`` (same payload shape)."""
    return list_category_rules(db=db, current_user=current_user)


# ---------------------------------------------------------------------------
# POST /categories/apply-mappings
# ---------------------------------------------------------------------------


@router.post("/apply-mappings")
def apply_description_mappings_to_transactions(
    body: dict | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Apply enabled ``category_rules`` to transactions with NULL ``category``.

    Optional ``document_id`` limits updates to transactions linked to that document
    (must belong to the caller).
    """
    set_rls_user(db, current_user.id)

    payload = body or {}
    raw_doc = payload.get("document_id")
    document_id: str | None = None
    if raw_doc is not None:
        stripped = str(raw_doc).strip()
        if stripped:
            document_id = stripped

    if document_id is not None:
        exists = db.execute(
            select(Document.id).where(
                Document.id == document_id,
                Document.user_id == current_user.id,
            )
        ).scalar_one_or_none()
        if exists is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found.",
            )

    updated = apply_category_rules_to_transactions(
        db, current_user.id, document_id=document_id
    )
    db.commit()
    return {"message": "Mappings applied", "updated": updated}


# ---------------------------------------------------------------------------
# POST /categories/analyze
# ---------------------------------------------------------------------------


@router.post("/analyze")
async def analyze_and_categorize(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_dev_analyze_bypass),
) -> dict:
    """Run LLM categorization for distinct transaction descriptions (AI sync).

    Upserts ``category_rules`` with ``match_type='exact'`` and ``pattern`` = description,
    then applies rules to uncategorized transactions for this user.
    """
    t0 = time.perf_counter()
    user_id = current_user.id
    logger.info(
        "[AI-Sync] POST /categories/analyze ENTER user_id=%s email=%s",
        user_id,
        current_user.email,
    )
    set_rls_user(db, current_user.id)

    raw_desc: list[str] = (
        db.execute(
            select(Transaction.description)
            .where(
                Transaction.user_id == current_user.id,
                Transaction.description.isnot(None),
            )
            .distinct()
        )
        .scalars()
        .all()
    )
    print(raw_desc, flush=True)
    # AI Sync builds rules from description text only; ignore blank / whitespace-only values.
    desc_rows: list[str] = sorted(
        {str(d).strip() for d in raw_desc if d is not None and str(d).strip()}
    )
    logger.debug(
        "AI Sync: distinct descriptions raw=%s usable=%s (%.2fs)",
        len(raw_desc),
        len(desc_rows),
        time.perf_counter() - t0,
    )

    if not desc_rows:
        logger.info(
            "[AI-Sync] early_exit user=%s usable_descriptions=0 duration_s=%.2f",
            user_id,
            time.perf_counter() - t0,
        )
        return {
            "message": (
                "No transaction descriptions to analyze. "
                "AI Sync needs non-empty text in each row's description field; "
                "parent or category columns alone are not used to create rules."
            ),
            "mapped": 0,
            "transactions_updated": 0,
        }
    raw_master = _fetch_raw_master_rows(db, current_user.id)
    deduped = _dedupe_master_rows_for_user(raw_master, current_user.id)
    allowed: set[tuple[str, str]] = {
        (r.parent_category, r.sub_category) for r in deduped
    }
    hierarchy = _build_category_hierarchy(list(deduped))
    category_hierarchy_text = _hierarchy_to_text(hierarchy)
    logger.debug(
        "AI Sync: loaded category_master pairs=%s (%.2fs)",
        len(allowed),
        time.perf_counter() - t0,
    )

    settings = get_settings()
    llm = _build_llm(settings)
    chain = category_prompt | llm
    logger.info(
        "[AI-Sync] LLM client model=%s base_url=%s temperature=0.1",
        settings.openrouter_model,
        settings.openrouter_base_url,
    )

    upsert_sql = text(
        """
        INSERT INTO category_rules
            (id, user_id, match_type, pattern, priority, parent_category, sub_category,
             payment_method, enabled, created_at)
        VALUES
            (:id, :user_id, 'exact', :pattern, 0, :parent_category, :sub_category,
             :payment_method, true, now())
        ON CONFLICT (user_id, match_type, pattern)
        DO UPDATE SET
            parent_category = EXCLUDED.parent_category,
            sub_category    = EXCLUDED.sub_category,
            payment_method  = EXCLUDED.payment_method,
            updated_at      = now(),
            updated_by      = :user_id
        """
    )

    total_mapped = 0
    chunks = list(_chunks(desc_rows, _CHUNK_SIZE))

    logger.debug(
        "AI Sync: starting LLM phase chunks=%s descriptions_total=%s (%.2fs)",
        len(chunks),
        len(desc_rows),
        time.perf_counter() - t0,
    )

    for chunk_index, chunk in enumerate(chunks, start=1):
        print(chunk, flush=True)

        descriptions_text = "\n".join(
            f"{idx + 1}. {desc}" for idx, desc in enumerate(chunk)
        )
        chunk_t0 = time.perf_counter()
        invoke_payload = {
            "category_hierarchy": category_hierarchy_text,
            "descriptions_text": descriptions_text,
        }
        logger.info(
            "[AI-Sync] LLM_INVOKE chunk=%s/%s lines_in_chunk=%s "
            "category_hierarchy_chars=%s descriptions_text_chars=%s elapsed_since_enter_s=%.2f",
            chunk_index,
            len(chunks),
            len(chunk),
            len(category_hierarchy_text),
            len(descriptions_text),
            time.perf_counter() - t0,
        )
        logger.info(
            "[AI-Sync] LLM_REQUEST category_hierarchy (preview):\n%s",
            _truncate_for_llm_log(category_hierarchy_text),
        )
        logger.info(
            "[AI-Sync] LLM_REQUEST descriptions_text (preview):\n%s",
            _truncate_for_llm_log(descriptions_text),
        )
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(
                "[AI-Sync] LLM_REQUEST category_hierarchy FULL len=%s:\n%s",
                len(category_hierarchy_text),
                category_hierarchy_text,
            )
            logger.debug(
                "[AI-Sync] LLM_REQUEST descriptions_text FULL len=%s:\n%s",
                len(descriptions_text),
                descriptions_text,
            )
        logger.info(
            "categories.analyze: LLM_CHUNK_START lines=%s elapsed_since_post_enter_s=%.2f user_id=%s",
            len(chunk),
            time.perf_counter() - t0,
            user_id,
        )

        try:
            response = await chain.ainvoke(invoke_payload)
            raw_content = _normalize_llm_message_content(response.content)
            logger.info(
                "[AI-Sync] LLM_RAW_RESPONSE chunk=%s/%s content_chars=%s chunk_wall_s=%.2f",
                chunk_index,
                len(chunks),
                len(raw_content),
                time.perf_counter() - chunk_t0,
            )
            logger.info(
                "[AI-Sync] LLM_RESPONSE content (preview):\n%s",
                _truncate_for_llm_log(raw_content),
            )
            if logger.isEnabledFor(logging.DEBUG):
                logger.debug(
                    "[AI-Sync] LLM_RESPONSE content FULL len=%s:\n%s",
                    len(raw_content),
                    raw_content,
                )
            logger.info(
                "categories.analyze: LLM_CHUNK_DONE lines=%s chunk_wall_s=%.2f elapsed_since_post_enter_s=%.2f user_id=%s",
                len(chunk),
                time.perf_counter() - chunk_t0,
                time.perf_counter() - t0,
                user_id,
            )
        except Exception as exc:
            logger.exception("LLM categorization failed for chunk: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Categorization failed — please try again.",
            ) from exc

        try:
            categorized: list[dict] = _parse_llm_json(raw_content)
        except (json.JSONDecodeError, ValueError) as exc:
            logger.error(
                "[AI-Sync] PARSE_FAILED chunk=%s/%s error=%s raw_preview=\n%s",
                chunk_index,
                len(chunks),
                exc,
                _truncate_for_llm_log(raw_content, max_chars=8000),
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Categorization failed — LLM returned unexpected format.",
            ) from exc

        for item in categorized:
            description = item.get("description", "").strip()
            if not description:
                continue

            raw_parent = (item.get("parent_category") or "").strip()
            raw_sub = (item.get("sub_category") or "").strip()
            if raw_parent and raw_sub and (raw_parent, raw_sub) not in allowed:
                _ensure_user_master_pair(
                    db, current_user, raw_parent, raw_sub, allowed, hierarchy
                )
                category_hierarchy_text = _hierarchy_to_text(hierarchy)

            parent_resolved, sub_resolved = _resolve_llm_parent_sub(
                item, allowed, hierarchy
            )
            if not parent_resolved or not sub_resolved:
                logger.warning(
                    "Skipping categorization row with no resolvable category: %r",
                    item,
                )
                continue

            payment = _normalize_payment(item.get("payment_method"))

            db.execute(
                upsert_sql,
                {
                    "id": str(uuid.uuid4()),
                    "user_id": current_user.id,
                    "pattern": description,
                    "parent_category": parent_resolved,
                    "sub_category": sub_resolved,
                    "payment_method": payment,
                },
            )
            total_mapped += 1

    txn_updated = apply_category_rules_to_transactions(db, current_user.id, None)
    logger.debug(
        "AI Sync: apply rules to transactions updated=%s (%.2fs since start)",
        txn_updated,
        time.perf_counter() - t0,
    )
    db.commit()
    logger.info(
        "[AI-Sync] DONE user=%s mapped=%s transactions_updated=%s duration_s=%.2f",
        user_id,
        total_mapped,
        txn_updated,
        time.perf_counter() - t0,
    )
    return {
        "message": "Categorization complete",
        "mapped": total_mapped,
        "transactions_updated": txn_updated,
    }


# ---------------------------------------------------------------------------
# PATCH /categories/rules/{entry_id}  (and legacy /descriptions/{entry_id})
# ---------------------------------------------------------------------------


def _patch_category_rule(
    entry_id: str,
    body: dict,
    db: Session,
    current_user: User,
) -> dict:
    """Shared PATCH handler for a single category_rule row."""
    set_rls_user(db, current_user.id)

    if "payment_method" in body:
        pm = body["payment_method"]
        if pm is not None and pm != "" and pm not in PAYMENT_METHODS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid payment_method. Allowed: {PAYMENT_METHODS}",
            )

    if "match_type" in body:
        mt = str(body["match_type"] or "").strip().lower()
        if mt not in ("exact", "contains", "regex"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="match_type must be one of: exact, contains, regex.",
            )

    entry = db.execute(
        select(CategoryRule).where(
            CategoryRule.id == entry_id,
            CategoryRule.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category rule '{entry_id}' not found.",
        )

    for field in (
        "parent_category",
        "sub_category",
        "payment_method",
        "pattern",
        "match_type",
        "priority",
        "enabled",
    ):
        if field in body:
            val = body[field]
            if field == "payment_method" and val == "":
                val = None
            if field == "priority":
                entry.priority = int(val) if val is not None else 0
            elif field == "enabled":
                entry.enabled = bool(val)
            elif field == "match_type":
                entry.match_type = str(val).strip().lower()
            elif field == "pattern":
                entry.pattern = str(val).strip()
            else:
                setattr(entry, field, val)

    entry.updated_by = current_user.id
    entry.updated_at = datetime.now(UTC)

    try:
        db.commit()
        db.refresh(entry)
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to update category rule %s: %s", entry_id, exc)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Update conflicts with another rule (duplicate pattern and match type).",
        ) from exc

    return _serialize_category_rule(entry)


@router.patch("/rules/{entry_id}")
def update_category_rule(
    entry_id: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Update fields on a category_rule row owned by the current user."""
    return _patch_category_rule(entry_id, body, db, current_user)


@router.patch("/descriptions/{entry_id}")
def update_description_category(
    entry_id: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Backward-compatible alias for ``PATCH /categories/rules/{entry_id}``."""
    return _patch_category_rule(entry_id, body, db, current_user)
