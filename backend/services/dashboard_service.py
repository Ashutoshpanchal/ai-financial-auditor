"""Dashboard bootstrap service — creates default widgets and layout for new users."""

from __future__ import annotations

import copy
import logging
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.default_dashboard_config import DEFAULT_LAYOUT, DEFAULT_WIDGETS
from backend.models.dashboard import UserDashboard
from backend.models.widget import UserWidget

logger = logging.getLogger(__name__)


def is_dashboard_bootstrapped(user_id: str, db: Session) -> bool:
    """Return True if the user already has default widgets (bootstrap already ran).

    Queries the user_widgets table for rows belonging to the user where
    is_default is True. A count greater than zero means the bootstrap has
    already been applied and should not be repeated.

    Args:
        user_id: The UUID string identifying the user.
        db:      Active SQLAlchemy ORM session.

    Returns:
        True if at least one default widget row exists for the user, else False.
    """
    result = db.execute(
        select(func.count())
        .select_from(UserWidget)
        .where(UserWidget.user_id == user_id, UserWidget.is_default == True)  # noqa: E712
    ).scalar()
    return (result or 0) > 0


def bootstrap_default_dashboard(user_id: str, db: Session) -> None:
    """Create default widgets and dashboard layout for a new user.

    Reads DEFAULT_WIDGETS and DEFAULT_LAYOUT from default_dashboard_config,
    inserts UserWidget rows, then creates a UserDashboard row with widget UUIDs
    mapped from widget_index references in the layout. All in one transaction.
    No-op if already bootstrapped.

    Args:
        user_id: The UUID string identifying the user.
        db:      Active SQLAlchemy ORM session.

    Raises:
        Exception: Any database error encountered during the transaction.
                   The session is rolled back before re-raising.
    """
    if is_dashboard_bootstrapped(user_id, db):
        logger.debug("Dashboard already bootstrapped for user %s — skipping", user_id)
        return

    try:
        # Build UserWidget objects and collect their UUIDs in order
        widget_uuids: list[str] = []
        widget_objects: list[UserWidget] = []

        for widget_def in DEFAULT_WIDGETS:
            widget_id = str(uuid4())
            widget_uuids.append(widget_id)
            widget_objects.append(
                UserWidget(
                    id=widget_id,
                    user_id=user_id,
                    title=widget_def["title"],
                    widget_type=widget_def["widget_type"],
                    query_config=widget_def["query_config"],
                    is_default=True,
                )
            )

        db.add_all(widget_objects)

        # Build the layout JSON: replace widget_index references with real UUIDs
        layout_json: dict = copy.deepcopy(DEFAULT_LAYOUT)
        resolved_grid: list[dict] = []

        for entry in layout_json["grid"]:
            widget_index: int = entry["widget_index"]
            resolved_entry = {k: v for k, v in entry.items() if k != "widget_index"}
            resolved_entry["widget_id"] = widget_uuids[widget_index]
            resolved_grid.append(resolved_entry)

        layout_json["grid"] = resolved_grid

        dashboard_obj = UserDashboard(
            id=str(uuid4()),
            user_id=user_id,
            layout=layout_json,
        )
        db.add(dashboard_obj)

        db.commit()
        logger.info(
            "Bootstrapped default dashboard for user %s: %d widgets",
            user_id,
            len(widget_objects),
        )

    except Exception:
        db.rollback()
        logger.exception("Failed to bootstrap dashboard for user %s", user_id)
        raise
