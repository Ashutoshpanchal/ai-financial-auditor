"""FastAPI router for dashboard widget CRUD and layout management."""

from __future__ import annotations

import logging
from datetime import date
from typing import TYPE_CHECKING, Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from backend.config import get_settings
from backend.database import get_db, set_rls_user
from backend.middleware.auth import get_current_user
from backend.models.dashboard import UserDashboard
from backend.models.user import UserRole
from backend.models.widget import UserWidget
from backend.services.preview_rate_limit import (
    WidgetPreviewRateLimited,
    check_widget_preview_rate_limit,
)
from backend.services.widget_query import (
    describe_widget_query_human,
    describe_widget_query_real,
    resolve_widget_data,
    validate_widget_query_config,
)

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from backend.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

_ALLOWED_WIDGET_TYPES: frozenset[str] = frozenset(
    {"metric", "spend_receive_pair", "bar_chart", "pie_chart", "line_chart"}
)


# ---------------------------------------------------------------------------
# Pydantic request/response models
# ---------------------------------------------------------------------------


class WidgetCreate(BaseModel):
    """Request body for creating a new widget in the user's library."""

    title: str
    widget_type: str  # 'metric' | 'bar_chart' | 'pie_chart' | 'line_chart'
    query_config: dict[str, Any]


class WidgetUpdate(BaseModel):
    """Request body for partially updating a widget."""

    title: str | None = None
    query_config: dict[str, Any] | None = None


class LayoutUpdate(BaseModel):
    """Request body for replacing the user's dashboard layout."""

    layout: dict[str, Any]


class WidgetPreviewRequest(BaseModel):
    """Request body for previewing widget data without persisting."""

    widget_type: str
    query_config: dict[str, Any]
    date_from: date | None = None
    date_to: date | None = None
    bank_name: str | None = None
    category: str | None = None
    parent_category: str | None = None
    sub_category: str | None = None
    sub_categories: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _widget_to_dict(widget: UserWidget) -> dict[str, Any]:
    """Serialise a UserWidget ORM object to a plain dict for JSON responses."""
    return {
        "id": widget.id,
        "title": widget.title,
        "widget_type": widget.widget_type,
        "query_config": widget.query_config,
        "is_default": widget.is_default,
        "created_at": widget.created_at,
    }


# ---------------------------------------------------------------------------
# GET /dashboard/widgets
# ---------------------------------------------------------------------------


@router.get("/widgets")
def list_widgets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Return all widgets in the current user's library.

    Applies Row Level Security so only the caller's rows are visible.
    """
    set_rls_user(db, current_user.id)

    widgets = (
        db.execute(select(UserWidget).where(UserWidget.user_id == current_user.id))
        .scalars()
        .all()
    )

    return [_widget_to_dict(w) for w in widgets]


# ---------------------------------------------------------------------------
# POST /dashboard/widgets/preview
# ---------------------------------------------------------------------------


@router.post("/widgets/preview")
def preview_widget(
    body: WidgetPreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Run resolve_widget_data for a provisional config without saving.

    Returns data, a human-readable pseudo-query (abstract table name), and never
    trusts client-supplied user identifiers for tenancy.
    """
    set_rls_user(db, current_user.id)

    settings = get_settings()
    if settings.widget_preview_rate_limit_per_minute > 0:
        try:
            check_widget_preview_rate_limit(
                current_user.id, settings.widget_preview_rate_limit_per_minute
            )
        except WidgetPreviewRateLimited as exc:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=exc.message,
            ) from exc

    if body.widget_type not in _ALLOWED_WIDGET_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Invalid widget_type '{body.widget_type}'. "
                f"Allowed values: {sorted(_ALLOWED_WIDGET_TYPES)}"
            ),
        )

    try:
        validate_widget_query_config(body.widget_type, body.query_config)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    try:
        data = resolve_widget_data(
            config=body.query_config,
            user_id=current_user.id,
            db=db,
            date_from=body.date_from,
            date_to=body.date_to,
            bank_name=body.bank_name,
            category=body.category,
            parent_category=body.parent_category,
            sub_category=body.sub_category,
            sub_categories=body.sub_categories or None,
            default_month_for_preview=True,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    human = describe_widget_query_human(body.query_config)
    payload: dict[str, Any] = {"data": data, "human_query": human}
    if current_user.role == UserRole.super_admin:
        payload["debug_sql"] = describe_widget_query_real(
            body.query_config,
            current_user.id,
            date_from=body.date_from,
            date_to=body.date_to,
            bank_name=body.bank_name,
            category=body.category,
            parent_category=body.parent_category,
            sub_category=body.sub_category,
            sub_categories=body.sub_categories or None,
            default_month_for_preview=True,
        )
    return payload


# ---------------------------------------------------------------------------
# GET /dashboard/widgets/{widget_id}
# ---------------------------------------------------------------------------


@router.get("/widgets/{widget_id}")
def get_widget(
    widget_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Return a single widget by id for the current user.

    Raises 404 if the widget does not exist.
    """
    set_rls_user(db, current_user.id)

    widget = db.execute(
        select(UserWidget).where(UserWidget.id == widget_id)
    ).scalar_one_or_none()

    if widget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Widget '{widget_id}' not found.",
        )

    return _widget_to_dict(widget)


# ---------------------------------------------------------------------------
# POST /dashboard/widgets
# ---------------------------------------------------------------------------


@router.post("/widgets", status_code=status.HTTP_201_CREATED)
def create_widget(
    body: WidgetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Create a new widget in the current user's library.

    Validates widget_type against the allowed set.
    Raises 422 if widget_type is not one of metric | bar_chart | pie_chart | line_chart.
    """
    set_rls_user(db, current_user.id)

    if body.widget_type not in _ALLOWED_WIDGET_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Invalid widget_type '{body.widget_type}'. "
                f"Allowed values: {sorted(_ALLOWED_WIDGET_TYPES)}"
            ),
        )

    try:
        validate_widget_query_config(body.widget_type, body.query_config)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    widget = UserWidget(
        id=str(uuid4()),
        user_id=current_user.id,
        title=body.title,
        widget_type=body.widget_type,
        query_config=body.query_config,
        is_default=False,
    )
    db.add(widget)
    db.commit()
    db.refresh(widget)

    return _widget_to_dict(widget)


# ---------------------------------------------------------------------------
# PATCH /dashboard/widgets/{widget_id}
# ---------------------------------------------------------------------------


@router.patch("/widgets/{widget_id}")
def update_widget(
    widget_id: str,
    body: WidgetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Update a widget's title and/or query_config.

    Only the fields present in the request body are updated; None values are skipped.
    RLS ensures the user can only see and update their own widgets.
    Raises 404 if the widget does not exist or belongs to another user.
    """
    set_rls_user(db, current_user.id)

    widget = db.execute(
        select(UserWidget).where(UserWidget.id == widget_id)
    ).scalar_one_or_none()

    if widget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Widget '{widget_id}' not found.",
        )

    if body.title is not None:
        widget.title = body.title
    if body.query_config is not None:
        try:
            validate_widget_query_config(widget.widget_type, body.query_config)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc
        widget.query_config = body.query_config

    db.commit()
    db.refresh(widget)

    return _widget_to_dict(widget)


# ---------------------------------------------------------------------------
# DELETE /dashboard/widgets/{widget_id}
# ---------------------------------------------------------------------------


@router.delete(
    "/widgets/{widget_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_widget(
    widget_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Delete a widget from the user's library and remove it from their layout.

    Also removes widget_id from the user's dashboard grid if present.
    Raises 404 if the widget does not exist.
    """
    set_rls_user(db, current_user.id)

    widget = db.execute(
        select(UserWidget).where(UserWidget.id == widget_id)
    ).scalar_one_or_none()

    if widget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Widget '{widget_id}' not found.",
        )

    # Remove the widget from the dashboard layout grid if it is referenced there.
    dashboard = db.execute(
        select(UserDashboard).where(UserDashboard.user_id == current_user.id)
    ).scalar_one_or_none()

    if dashboard is not None:
        layout: dict[str, Any] = dashboard.layout or {"cols": 3, "grid": []}
        grid: list[Any] = list(layout.get("grid") or [])
        updated_grid = [item for item in grid if item.get("widget_id") != widget_id]
        if len(updated_grid) != len(grid):
            dashboard.layout = {**layout, "grid": updated_grid}

    db.delete(widget)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# GET /dashboard/widgets/{widget_id}/data
# ---------------------------------------------------------------------------


@router.get("/widgets/{widget_id}/data")
def get_widget_data(
    widget_id: str,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    bank_name: str | None = Query(default=None),
    category: str | None = Query(default=None),
    parent_category: str | None = Query(default=None),
    sub_category: Annotated[list[str] | None, Query()] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any] | list[dict[str, Any]]:
    """Execute the live data query for a widget and return the result.

    Supports optional query-param filters including parent/sub category.
    Global query params override config-level filters when both are supplied.
    Raises 404 if the widget does not exist.
    Raises 422 if the widget's query_config contains invalid aggregation parameters.
    """
    set_rls_user(db, current_user.id)

    widget = db.execute(
        select(UserWidget).where(UserWidget.id == widget_id)
    ).scalar_one_or_none()

    if widget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Widget '{widget_id}' not found.",
        )

    try:
        result = resolve_widget_data(
            config=widget.query_config,
            user_id=current_user.id,
            db=db,
            date_from=date_from,
            date_to=date_to,
            bank_name=bank_name,
            category=category,
            parent_category=parent_category,
            sub_categories=sub_category,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    return result


# ---------------------------------------------------------------------------
# GET /dashboard/layout
# ---------------------------------------------------------------------------


@router.get("/layout")
def get_layout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Return the current user's dashboard layout.

    Returns a default empty layout if the user has not saved a layout yet.
    """
    set_rls_user(db, current_user.id)

    dashboard = db.execute(
        select(UserDashboard).where(UserDashboard.user_id == current_user.id)
    ).scalar_one_or_none()

    if dashboard is None:
        return {"cols": 3, "grid": []}

    return dashboard.layout


# ---------------------------------------------------------------------------
# PUT /dashboard/layout
# ---------------------------------------------------------------------------


@router.put("/layout")
def save_layout(
    body: LayoutUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Save (upsert) the current user's dashboard layout.

    Creates a new UserDashboard row if one does not already exist for the user;
    otherwise updates the existing row's layout in place.
    """
    set_rls_user(db, current_user.id)

    dashboard = db.execute(
        select(UserDashboard).where(UserDashboard.user_id == current_user.id)
    ).scalar_one_or_none()

    if dashboard is not None:
        dashboard.layout = body.layout
    else:
        dashboard = UserDashboard(
            id=str(uuid4()),
            user_id=current_user.id,
            layout=body.layout,
        )
        db.add(dashboard)

    db.commit()

    return {"layout": body.layout}
