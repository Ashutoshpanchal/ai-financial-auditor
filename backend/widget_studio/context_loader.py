"""Load category/subcategory context for Widget Studio clarification."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from backend.services.category_master_service import (
    build_category_hierarchy,
    dedupe_master_rows_for_user,
    fetch_raw_master_rows,
)

_session_category_cache: dict[str, str] = {}


def load_categories_document(user_id: str, db: Session) -> str:
    """Fetch and format categories for injection into agent prompts.

    Args:
        user_id: Authenticated user id.
        db:      SQLAlchemy session.

    Returns:
        JSON string of parent -> [sub_category, ...].
    """
    rows = fetch_raw_master_rows(db, user_id)
    deduped = dedupe_master_rows_for_user(rows, user_id)
    hierarchy = build_category_hierarchy(deduped)
    return json.dumps(hierarchy, indent=2)


def get_session_categories_doc(session_id: str, user_id: str, db: Session) -> str:
    """Return cached category doc for a session, loading once per session."""
    cached = _session_category_cache.get(session_id)
    if cached is not None:
        return cached
    doc = load_categories_document(user_id, db)
    _session_category_cache[session_id] = doc
    return doc


def clear_session_category_cache(session_id: str | None = None) -> None:
    """Clear category cache (all sessions or one session — tests only)."""
    if session_id is None:
        _session_category_cache.clear()
    else:
        _session_category_cache.pop(session_id, None)


def category_filters_still_valid(
    hardcoded_filters: dict[str, Any] | None,
    user_id: str,
    db: Session,
) -> bool:
    """Return False if a saved widget references a deleted category."""
    if not hardcoded_filters:
        return True
    hierarchy = json.loads(load_categories_document(user_id, db))
    parent = hardcoded_filters.get("parent_label") or hardcoded_filters.get(
        "parent_category"
    )
    sub = hardcoded_filters.get("sub_label") or hardcoded_filters.get("sub_category")
    if parent and parent not in hierarchy:
        return False
    if sub and parent:
        subs = hierarchy.get(parent, [])
        if sub not in subs:
            return False
    return True
