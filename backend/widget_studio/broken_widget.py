"""Broken widget detection and persistence for Widget Studio definitions."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from backend.models.widget_studio import WidgetDefinition
from backend.widget_studio.context_loader import category_filters_still_valid
from backend.widget_studio.vocabulary import WIDGET_BROKEN_ERROR, WIDGET_BROKEN_MESSAGE


def hardcoded_filters_from_query_config(
    query_config: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Extract literal category filters from a dashboard ``query_config``."""
    if not query_config:
        return None
    filters = query_config.get("filters")
    if not isinstance(filters, dict):
        return None
    out: dict[str, Any] = {}
    parent = filters.get("parent_category")
    sub = filters.get("sub_category")
    if parent and "{{" not in str(parent):
        out["parent_label"] = str(parent)
    if sub and "{{" not in str(sub):
        out["sub_label"] = str(sub)
    return out or None


def query_config_category_still_valid(
    query_config: dict[str, Any] | None,
    user_id: str,
    db: Session,
) -> bool:
    """Return whether literal categories in ``query_config`` still exist."""
    hardcoded = hardcoded_filters_from_query_config(query_config)
    return category_filters_still_valid(hardcoded, user_id, db)


def mark_widget_broken_if_needed(
    widget: WidgetDefinition,
    user_id: str,
    db: Session,
) -> bool:
    """Set ``broken=True`` when hardcoded filters reference missing categories.

    Args:
        widget:  Widget definition row (mutated in place on failure).
        user_id: Owner id for category hierarchy lookup.
        db:      SQLAlchemy session.

    Returns:
        True if the widget is broken after this check.
    """
    if widget.broken:
        return True
    if not category_filters_still_valid(widget.hardcoded_filters, user_id, db):
        widget.broken = True
        db.commit()
        return True
    return False


def widget_broken_response() -> dict[str, str]:
    """Standard API payload when a widget cannot run due to missing category."""
    return {"error": WIDGET_BROKEN_ERROR, "message": WIDGET_BROKEN_MESSAGE}
