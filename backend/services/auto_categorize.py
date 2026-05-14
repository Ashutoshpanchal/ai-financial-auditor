"""Auto-categorize transactions by matching short_description against category_master."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy import or_, select

from backend.models.category_master import CategoryMaster

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Minimum sub_category length for substring containment (avoids noisy single-token hits).
_MIN_SUBSTRING_LEN = 3


def _substring_match_cm(
    short_lower: str,
    cm_rows: list[CategoryMaster],
    user_id: str,
) -> CategoryMaster | None:
    """Pick best CM row where ``sub_category.lower()`` is contained in *short_lower*."""
    best: list[CategoryMaster] = []
    best_len = 0
    for cm in cm_rows:
        sub_l = cm.sub_category.lower()
        if len(sub_l) < _MIN_SUBSTRING_LEN:
            continue
        if sub_l not in short_lower:
            continue
        if len(sub_l) > best_len:
            best = [cm]
            best_len = len(sub_l)
        elif len(sub_l) == best_len:
            best.append(cm)
    if not best:
        return None
    user_owned = [c for c in best if c.user_id == user_id]
    if user_owned:
        return user_owned[0]
    global_only = [c for c in best if c.user_id is None]
    return global_only[0] if global_only else best[0]


def auto_categorize_transactions(
    db: Session,
    user_id: str,
    document_id: str | None = None,
) -> int:
    """Match transaction short_descriptions against category_master and auto-categorize.

    First tries hyphen-separated tokens against ``sub_category`` (case-insensitive
    exact token match). If none match, falls back to substring match: CM
    ``sub_category`` (length ≥ ``_MIN_SUBSTRING_LEN``) contained in the full
    ``short_description``; longest matching ``sub_category`` wins, with user-owned
    CM preferred over global on ties.

    Sets ``parent_category``, ``sub_category``, ``category`` and ``category_master_id``.

    Args:
        db:          SQLAlchemy session (RLS should already be set).
        user_id:     Owner of the transactions.
        document_id: When set, only transactions for this document are processed.

    Returns:
        Number of transaction rows that were auto-categorized.
    """
    from backend.models.transaction import Transaction

    cm_rows = list(
        db.execute(
            select(CategoryMaster).where(
                or_(
                    CategoryMaster.user_id.is_(None),
                    CategoryMaster.user_id == user_id,
                )
            )
        )
        .scalars()
        .all()
    )
    if not cm_rows:
        return 0

    cm_by_sub: dict[str, CategoryMaster] = {}
    for row in cm_rows:
        key = row.sub_category.lower()
        existing = cm_by_sub.get(key)
        if existing is None:
            cm_by_sub[key] = row
        else:
            if (row.user_id is not None and existing.user_id is None) or (
                row.user_id is not None
                and existing.user_id is not None
                and len(row.sub_category) > len(existing.sub_category)
            ):
                cm_by_sub[key] = row

    q = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.category_master_id.is_(None),
        Transaction.short_description.isnot(None),
    )
    if document_id is not None:
        q = q.filter(Transaction.document_id == document_id)
    txns = q.all()

    updated = 0
    for txn in txns:
        short_lower = (txn.short_description or "").lower().strip()
        if not short_lower:
            continue

        best_cm: CategoryMaster | None = None
        best_token_len = 0
        for token in short_lower.split("-"):
            if not token:
                continue
            cm = cm_by_sub.get(token)
            if cm is not None and len(token) > best_token_len:
                best_cm = cm
                best_token_len = len(token)

        if best_cm is None:
            best_cm = _substring_match_cm(short_lower, cm_rows, user_id)

        if best_cm is not None:
            txn.category = f"{best_cm.parent_category} / {best_cm.sub_category}"
            txn.parent_category = best_cm.parent_category
            txn.sub_category = best_cm.sub_category
            txn.category_master_id = str(best_cm.id)
            updated += 1

    if updated:
        db.flush()
        logger.info(
            "auto_categorize: user=%s document=%s categorized=%d",
            user_id,
            document_id,
            updated,
        )
    return updated
