"""FastAPI router for category management — master dictionary and per-user description mappings."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, status
from langchain_openai import ChatOpenAI
from sqlalchemy import select, text

from backend.config import Settings, get_settings
from backend.database import get_db, set_rls_user
from backend.middleware.auth import get_current_user, require_admin
from backend.models.category_master import CategoryMaster
from backend.models.description_category import DescriptionCategory
from backend.models.transaction import Transaction
from backend.prompts.category_prompt import category_prompt

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from backend.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/categories", tags=["categories"])

_CHUNK_SIZE = 100  # max descriptions per LLM call to avoid context-window overflow

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


# ---------------------------------------------------------------------------
# GET /categories/master
# ---------------------------------------------------------------------------


@router.get("/master")
def list_category_master(db: Session = Depends(get_db)) -> dict[str, list[dict]]:
    """Return all category_master rows grouped by parent_category, including IDs.

    No authentication required — the master dictionary is global and public.
    Returns: {parent_category: [{id, sub_category}, ...]}
    """
    rows = db.execute(select(CategoryMaster)).scalars().all()
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row.parent_category, []).append(
            {"id": row.id, "sub_category": row.sub_category}
        )
    return grouped


# ---------------------------------------------------------------------------
# POST /categories/master  — admin only (mutates shared global dict)
# ---------------------------------------------------------------------------


@router.post("/master", status_code=status.HTTP_201_CREATED)
def create_category_master_entry(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> dict:
    """Add a new sub-category entry to the global category_master table.

    Restricted to admin/super_admin — the dictionary is shared across all users.
    Raises 409 if a row with the same (parent_category, sub_category) already exists.
    """
    parent_category: str = body.get("parent_category", "").strip()
    sub_category: str = body.get("sub_category", "").strip()

    if not parent_category or not sub_category:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Both parent_category and sub_category are required.",
        )

    existing = db.execute(
        select(CategoryMaster).where(
            CategoryMaster.parent_category == parent_category,
            CategoryMaster.sub_category == sub_category,
        )
    ).scalar_one_or_none()

    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Entry '{parent_category} / {sub_category}' already exists.",
        )

    entry = CategoryMaster(
        id=str(uuid.uuid4()),
        parent_category=parent_category,
        sub_category=sub_category,
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
# DELETE /categories/master/{entry_id}  — admin only
# ---------------------------------------------------------------------------


@router.delete("/master/{entry_id}", status_code=status.HTTP_200_OK)
def delete_category_master_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> dict:
    """Delete a category_master row by id.

    Restricted to admin/super_admin — the dictionary is shared across all users.
    Raises 404 if the entry does not exist.
    """
    entry = db.execute(
        select(CategoryMaster).where(CategoryMaster.id == entry_id)
    ).scalar_one_or_none()

    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category entry '{entry_id}' not found.",
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
# GET /categories/descriptions
# ---------------------------------------------------------------------------


@router.get("/descriptions")
def list_description_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Return all description_categories rows owned by the current user.

    Applies Row Level Security so the query only sees the caller's rows.
    """
    set_rls_user(db, current_user.id)

    rows = (
        db.execute(
            select(DescriptionCategory).where(
                DescriptionCategory.user_id == current_user.id
            )
        )
        .scalars()
        .all()
    )

    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "description": r.description,
            "parent_category": r.parent_category,
            "sub_category": r.sub_category,
            "payment_method": r.payment_method,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
            "updated_by": r.updated_by,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# POST /categories/analyze
# ---------------------------------------------------------------------------


@router.post("/analyze")
async def analyze_and_categorize(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Run LLM categorization for all distinct transaction descriptions of the current user.

    Descriptions are chunked into batches of _CHUNK_SIZE to stay within LLM context limits.
    Results are upserted into description_categories (ON CONFLICT DO UPDATE).
    """
    set_rls_user(db, current_user.id)

    # Fetch distinct non-null descriptions for this user
    desc_rows: list[str] = (
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

    if not desc_rows:
        return {"message": "No transactions found", "mapped": 0}

    master_rows = db.execute(select(CategoryMaster)).scalars().all()
    hierarchy = _build_category_hierarchy(list(master_rows))
    category_hierarchy_text = _hierarchy_to_text(hierarchy)

    settings = get_settings()
    llm = _build_llm(settings)
    chain = category_prompt | llm

    upsert_sql = text(
        """
        INSERT INTO description_categories
            (id, user_id, description, parent_category, sub_category, payment_method, created_at)
        VALUES
            (:id, :user_id, :description, :parent_category, :sub_category, :payment_method, now())
        ON CONFLICT (user_id, description)
        DO UPDATE SET
            parent_category = EXCLUDED.parent_category,
            sub_category    = EXCLUDED.sub_category,
            payment_method  = EXCLUDED.payment_method,
            updated_at      = now(),
            updated_by      = :user_id
        """
    )

    total_mapped = 0

    for chunk in _chunks(desc_rows, _CHUNK_SIZE):
        descriptions_text = "\n".join(
            f"{idx + 1}. {desc}" for idx, desc in enumerate(chunk)
        )

        try:
            response = await chain.ainvoke(
                {
                    "category_hierarchy": category_hierarchy_text,
                    "descriptions_text": descriptions_text,
                }
            )
            raw_content: str = response.content
        except Exception as exc:
            logger.exception("LLM categorization failed for chunk: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Categorization failed — please try again.",
            ) from exc

        try:
            categorized: list[dict] = _parse_llm_json(raw_content)
        except (json.JSONDecodeError, ValueError) as exc:
            logger.error("Failed to parse LLM response as JSON: %s", raw_content[:500])
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Categorization failed — LLM returned unexpected format.",
            ) from exc

        for item in categorized:
            description = item.get("description", "").strip()
            if not description:
                continue
            db.execute(
                upsert_sql,
                {
                    "id": str(uuid.uuid4()),
                    "user_id": current_user.id,
                    "description": description,
                    "parent_category": item.get("parent_category"),
                    "sub_category": item.get("sub_category"),
                    "payment_method": item.get("payment_method"),
                },
            )
            total_mapped += 1

    db.commit()
    return {"message": "Categorization complete", "mapped": total_mapped}


# ---------------------------------------------------------------------------
# PATCH /categories/descriptions/{entry_id}
# ---------------------------------------------------------------------------


@router.patch("/descriptions/{entry_id}")
def update_description_category(
    entry_id: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Update parent_category, sub_category, and/or payment_method for a description mapping.

    Validates payment_method against the allowed PAYMENT_METHODS list.
    Only the owning user may update their own rows.
    Raises 404 if the entry does not exist or belongs to another user.
    """
    set_rls_user(db, current_user.id)

    if "payment_method" in body and body["payment_method"] not in PAYMENT_METHODS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid payment_method. Allowed: {PAYMENT_METHODS}",
        )

    entry = db.execute(
        select(DescriptionCategory).where(
            DescriptionCategory.id == entry_id,
            DescriptionCategory.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Description category entry '{entry_id}' not found.",
        )

    for field in ("parent_category", "sub_category", "payment_method"):
        if field in body:
            setattr(entry, field, body[field])

    entry.updated_by = current_user.id
    entry.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(entry)

    return {
        "id": entry.id,
        "user_id": entry.user_id,
        "description": entry.description,
        "parent_category": entry.parent_category,
        "sub_category": entry.sub_category,
        "payment_method": entry.payment_method,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "updated_by": entry.updated_by,
    }
