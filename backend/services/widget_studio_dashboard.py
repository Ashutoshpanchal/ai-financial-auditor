"""Bridge Widget Studio definitions to dashboard ``user_widgets`` + layout."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.dashboard import UserDashboard
from backend.models.widget import UserWidget

_STUDIO_TO_DASHBOARD_TYPE: dict[str, str] = {
    "metric": "metric",
    "bar": "bar_chart",
    "line": "line_chart",
    "pie": "pie_chart",
    "multibar": "bar_chart",
}


def studio_type_to_dashboard(widget_type: str) -> str:
    """Map Widget Studio type string to dashboard widget_type."""
    return _STUDIO_TO_DASHBOARD_TYPE.get(widget_type, "metric")


def build_query_config_from_studio_widget(
    *,
    abstract_query: str,
    hardcoded_filters: dict[str, Any] | None,
) -> dict[str, Any]:
    """Build dashboard ``query_config`` from a Widget Studio definition."""
    config: dict[str, Any] = {
        "raw_metric_sql": abstract_query.strip(),
        "format": "currency",
    }
    if hardcoded_filters:
        filters: dict[str, Any] = {
            "date_from": "{{date_from}}",
            "date_to": "{{date_to}}",
            "bank_name": "{{bank_name}}",
            "parent_category": "{{parent_category}}",
            "sub_category": "{{sub_category}}",
        }
        parent = hardcoded_filters.get("parent_label") or hardcoded_filters.get(
            "parent_category"
        )
        sub = hardcoded_filters.get("sub_label") or hardcoded_filters.get(
            "sub_category"
        )
        if parent:
            filters["parent_category"] = str(parent)
        if sub:
            filters["sub_category"] = str(sub)
        config["filters"] = filters
    return config


def add_studio_widget_to_dashboard(
    db: Session,
    user_id: str,
    *,
    title: str,
    studio_widget_type: str,
    abstract_query: str,
    hardcoded_filters: dict[str, Any] | None,
    col_span: int = 1,
) -> tuple[UserWidget, dict[str, Any]]:
    """Create a ``user_widgets`` row and append it to the user's dashboard layout.

    Args:
        db:                 SQLAlchemy session.
        user_id:            Owner id.
        title:              Widget title on dashboard.
        studio_widget_type: Widget Studio type (metric, bar, …).
        abstract_query:     Abstract SQL stored on the definition.
        hardcoded_filters:  Optional literal category filters.
        col_span:           Grid width (1–3).

    Returns:
        Tuple of new UserWidget and updated layout dict.
    """
    dashboard_type = studio_type_to_dashboard(studio_widget_type)
    query_config = build_query_config_from_studio_widget(
        abstract_query=abstract_query,
        hardcoded_filters=hardcoded_filters,
    )
    widget = UserWidget(
        id=str(uuid4()),
        user_id=user_id,
        title=title,
        widget_type=dashboard_type,
        query_config=query_config,
    )
    db.add(widget)
    db.flush()

    dash = db.scalar(select(UserDashboard).where(UserDashboard.user_id == user_id))
    layout: dict[str, Any] = {"cols": 3, "grid": []}
    if dash is not None:
        layout = dict(dash.layout or layout)
    grid = list(layout.get("grid") or [])
    grid.append(
        {
            "widget_id": widget.id,
            "row": len(grid) // int(layout.get("cols") or 3),
            "col": len(grid) % int(layout.get("cols") or 3),
            "col_span": max(1, min(3, col_span)),
        }
    )
    layout["grid"] = grid
    if dash is None:
        dash = UserDashboard(user_id=user_id, layout=layout)
        db.add(dash)
    else:
        dash.layout = layout
    return widget, layout
