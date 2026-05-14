"""Apply enabled category_rules to uncategorized transactions (pattern → CM fields)."""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

from sqlalchemy import or_, select

from backend.models.category_master import CategoryMaster
from backend.models.category_rule import CategoryRule
from backend.models.transaction import Transaction

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def description_matches_rule(description: str, rule: CategoryRule) -> bool:
    """Return True when *description* satisfies *rule* for its ``match_type``."""
    desc = description or ""
    pattern = rule.pattern or ""
    mt = (rule.match_type or "exact").strip().lower()
    if mt == "exact":
        return desc.strip().lower() == pattern.strip().lower()
    if mt == "contains":
        return pattern.strip().lower() in desc.lower()
    if mt == "regex":
        try:
            return re.search(pattern, desc, re.IGNORECASE | re.DOTALL) is not None
        except re.error:
            logger.warning(
                "Invalid regex in category_rule id=%s pattern=%r", rule.id, pattern
            )
            return False
    return desc.strip().lower() == pattern.strip().lower()


def resolve_category_master_id(
    db: Session,
    user_id: str,
    parent_category: str,
    sub_category: str,
) -> str | None:
    """Return ``category_master.id`` for *(parent_category, sub_category)*.

    Prefers a user-owned row over a global seed when both exist.
    """
    rows = list(
        db.execute(
            select(CategoryMaster).where(
                CategoryMaster.parent_category == parent_category,
                CategoryMaster.sub_category == sub_category,
                or_(
                    CategoryMaster.user_id.is_(None), CategoryMaster.user_id == user_id
                ),
            )
        )
        .scalars()
        .all()
    )
    if not rows:
        return None
    for row in rows:
        if row.user_id == user_id:
            return str(row.id)
    for row in rows:
        if row.user_id is None:
            return str(row.id)
    return str(rows[0].id)


def apply_category_rules_to_transactions(
    db: Session,
    user_id: str,
    document_id: str | None = None,
) -> int:
    """Set category fields on transactions using enabled rules.

    For each transaction with NULL ``category_master_id``, finds the first enabled
    rule (highest ``priority`` first) whose pattern matches ``description``, then
    sets ``parent_category``, ``sub_category``, ``category``, and ``category_master_id``
    when a matching category_master row exists.

    Args:
        db: SQLAlchemy session (RLS should already be set).
        user_id: Owner of transactions and rules.
        document_id: When set, only transactions for this document are updated.

    Returns:
        Number of transaction rows updated.
    """
    rules = list(
        db.execute(
            select(CategoryRule)
            .where(
                CategoryRule.user_id == user_id,
                CategoryRule.enabled.is_(True),
            )
            .order_by(CategoryRule.priority.desc(), CategoryRule.created_at.asc())
        )
        .scalars()
        .all()
    )
    if not rules:
        return 0

    q = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.category_master_id.is_(None),
    )
    if document_id is not None:
        q = q.filter(Transaction.document_id == document_id)
    txns = q.all()

    updated = 0
    for txn in txns:
        desc = txn.description or ""
        for rule in rules:
            if not description_matches_rule(desc, rule):
                continue
            cm_id = resolve_category_master_id(
                db,
                user_id,
                rule.parent_category,
                rule.sub_category,
            )
            txn.parent_category = rule.parent_category
            txn.sub_category = rule.sub_category
            txn.category = f"{rule.parent_category} / {rule.sub_category}"
            if cm_id is not None:
                txn.category_master_id = cm_id
            updated += 1
            break

    if updated:
        db.flush()
        logger.info(
            "apply_category_rules: user=%s document=%s updated=%d",
            user_id,
            document_id,
            updated,
        )
    return updated
