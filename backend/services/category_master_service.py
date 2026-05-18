"""Category master fetch, dedupe, and grouped API shapes (shared by routers and analytics)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select  # pyright: ignore[reportUnknownVariableType]
from sqlalchemy.orm import Session

from backend.models.category_master import CategoryMaster


def fetch_raw_master_rows(db: Session, user_id: str) -> list[CategoryMaster]:
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


def dedupe_master_rows_for_user(
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


def grouped_master_response(
    rows: list[CategoryMaster],
) -> dict[str, list[dict[str, Any]]]:
    """Shape API JSON: parent -> [{id, sub_category, is_global}, ...]."""
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(row.parent_category, []).append(
            {
                "id": row.id,
                "sub_category": row.sub_category,
                "is_global": row.user_id is None,
            }
        )
    return grouped


def build_category_hierarchy(rows: list[CategoryMaster]) -> dict[str, list[str]]:
    """Build a {parent_category: [sub_category, ...]} dict from ORM rows."""
    hierarchy: dict[str, list[str]] = {}
    for row in rows:
        hierarchy.setdefault(row.parent_category, []).append(row.sub_category)
    return hierarchy


def get_merged_grouped_master(
    db: Session, user_id: str
) -> dict[str, list[dict[str, Any]]]:
    """Return merged parent -> sub-entries dict (same shape as GET /categories/master/split merged)."""
    raw = fetch_raw_master_rows(db, user_id)
    deduped = dedupe_master_rows_for_user(raw, user_id)
    return grouped_master_response(deduped)
