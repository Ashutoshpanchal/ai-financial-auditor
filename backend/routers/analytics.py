"""Analytics API — category flow aggregates for insights UI."""

from __future__ import annotations

import logging
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.database import get_db, set_rls_user
from backend.middleware.auth import get_current_user
from backend.models.user import User
from backend.services.category_flow_analytics import (
    compute_category_flow,
    compute_category_flow_by_parent_month,
    compute_category_flow_by_parent_paginated,
    compute_category_flow_metadata,
    compute_transaction_date_scope,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])

FlowMode = Literal["debit", "credit", "both"]


@router.get("/transaction-date-scope")
def get_transaction_date_scope(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Return min/max transaction dates and months with data for date pickers."""
    set_rls_user(db, current_user.id)

    try:
        return compute_transaction_date_scope(
            db=db,
            user_id=current_user.id,
        )
    except Exception as exc:
        logger.exception(
            "transaction-date-scope failed for user %s: %s",
            current_user.id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute transaction date scope.",
        ) from exc


@router.get("/category-flow")
def get_category_flow(
    date_from: date = Query(
        ..., description="Inclusive start of transaction_date range."
    ),
    date_to: date = Query(..., description="Inclusive end of transaction_date range."),
    parent_category: str = Query(
        ...,
        min_length=1,
        description="Primary category (coalesced label; matches category master parent).",
    ),
    sub_category: Annotated[
        list[str] | None,
        Query(description="Optional sub-categories (repeat param)."),
    ] = None,
    mode: FlowMode = Query(
        "both",
        description="debit: spending rows only; credit: income rows only; both: all groups.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Return PC-by-month-by-SC aggregates for the insights table.

    Raises:
        HTTPException 422: Invalid date range or body parameters.
    """
    if date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_from must be on or before date_to.",
        )

    subs: list[str] | None = None
    if sub_category:
        subs = [s.strip() for s in sub_category if s.strip()]
        if not subs:
            subs = None

    set_rls_user(db, current_user.id)

    try:
        return compute_category_flow(
            db=db,
            user_id=current_user.id,
            date_from=date_from,
            date_to=date_to,
            parent_category=parent_category,
            sub_categories=subs,
            mode=mode,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("category-flow failed for user %s: %s", current_user.id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute category flow.",
        ) from exc


@router.get("/category-flow-by-parent/metadata")
def get_category_flow_by_parent_metadata(
    date_from: date = Query(
        ..., description="Inclusive start of transaction_date range."
    ),
    date_to: date = Query(..., description="Inclusive end of transaction_date range."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Return data scope: available years, months, total rows, parent categories."""
    if date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_from must be on or before date_to.",
        )

    set_rls_user(db, current_user.id)

    try:
        return compute_category_flow_metadata(
            db=db,
            user_id=current_user.id,
            date_from=date_from,
            date_to=date_to,
        )
    except Exception as exc:
        logger.exception(
            "category-flow-by-parent/metadata failed for user %s: %s",
            current_user.id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute category flow metadata.",
        ) from exc


@router.get("/category-flow-by-parent/paginated")
def get_category_flow_by_parent_paginated_endpoint(
    date_from: date = Query(
        ..., description="Inclusive start of transaction_date range."
    ),
    date_to: date = Query(..., description="Inclusive end of transaction_date range."),
    mode: FlowMode = Query(
        "both",
        description="debit: spending groups only; credit: income groups only; both: all groups.",
    ),
    month_cursor: str | None = Query(
        None, description="Start from this YYYY-MM month (inclusive)."
    ),
    limit: int = Query(
        default=50,
        ge=1,
        le=200,
        description="Max rows per page.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Return paginated (parent_category, month) aggregates via month cursor."""
    if date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_from must be on or before date_to.",
        )

    set_rls_user(db, current_user.id)

    try:
        return compute_category_flow_by_parent_paginated(
            db=db,
            user_id=current_user.id,
            date_from=date_from,
            date_to=date_to,
            mode=mode,
            month_cursor=month_cursor,
            limit=limit,
        )
    except Exception as exc:
        logger.exception(
            "category-flow-by-parent/paginated failed for user %s: %s",
            current_user.id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute paginated category flow.",
        ) from exc


@router.get("/category-flow-by-parent")
def get_category_flow_by_parent(
    date_from: date = Query(
        ..., description="Inclusive start of transaction_date range."
    ),
    date_to: date = Query(..., description="Inclusive end of transaction_date range."),
    mode: FlowMode = Query(
        "both",
        description="debit: spending groups only; credit: income groups only; both: all groups.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Return parent-category by month aggregates (all PCs in range)."""
    if date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_from must be on or before date_to.",
        )

    set_rls_user(db, current_user.id)

    try:
        return compute_category_flow_by_parent_month(
            db=db,
            user_id=current_user.id,
            date_from=date_from,
            date_to=date_to,
            mode=mode,
        )
    except Exception as exc:
        logger.exception(
            "category-flow-by-parent failed for user %s: %s", current_user.id, exc
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute category flow by parent.",
        ) from exc
