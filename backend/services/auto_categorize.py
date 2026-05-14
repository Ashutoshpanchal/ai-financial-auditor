"""Auto-categorize transactions by matching short_description against category_master."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy import or_, select

from backend.models.category_master import CategoryMaster

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def auto_categorize_transactions(
    db: Session,
    user_id: str,
    document_id: str | None = None,
) -> int:
    """Match transaction short_descriptions against category_master and auto-categorize.

    For each uncategorized transaction, splits the short_description on ``-`` into
    tokens and checks if any token matches a ``category_master.sub_category``
    (case-insensitive exact match).  If found, sets ``parent_category``,
    ``sub_category``, ``category`` and ``category_master_id`` on the transaction.

    When multiple CM rows match, the user-owned row is preferred over the global
    seed, and the longer sub_category wins (more specific match).

    Args:
        db:          SQLAlchemy session (RLS should already be set).
        user_id:     Owner of the transactions.
        document_id: When set, only transactions for this document are processed.

    Returns:
        Number of transaction rows that were auto-categorized.
    """
    from backend.models.transaction import Transaction

    # Load all candidate category_master rows (global + user-owned)
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

    # Build a lookup: lower(sub_category) -> best CM row
    # For duplicate sub_categories, prefer user-owned, then longer label.
    cm_by_sub: dict[str, CategoryMaster] = {}
    for row in cm_rows:
        key = row.sub_category.lower()
        existing = cm_by_sub.get(key)
        if existing is None:
            cm_by_sub[key] = row
        else:
            # Prefer user-owned over global
            if row.user_id is not None and existing.user_id is None:
                cm_by_sub[key] = row
            elif row.user_id is not None and existing.user_id is not None:
                # Both user-owned: prefer longer (more specific) sub_category
                if len(row.sub_category) > len(existing.sub_category):
                    cm_by_sub[key] = row

    # Fetch uncategorized transactions with a non-null short_description
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
        tokens = (txn.short_description or "").lower().split("-")
        best_cm: CategoryMaster | None = None
        best_token_len = 0
        for token in tokens:
            cm = cm_by_sub.get(token)
            if cm is not None:
                # Pick the longest matching sub_category (most specific)
                if len(token) > best_token_len:
                    best_cm = cm
                    best_token_len = len(token)
        if best_cm is not None:
            txn.category = f"{best_cm.parent_category} / {best_cm.sub_category}"
            txn.parent_category = best_cm.parent_category
            txn.sub_category = best_cm.sub_category
            txn.category_master_id = best_cm.id
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
