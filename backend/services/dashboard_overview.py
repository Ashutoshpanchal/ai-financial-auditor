"""Aggregated dashboard overview — single payload for editorial card layout."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.models.transaction import Transaction
from backend.services.widget_query import (
    _build_where_clauses,
    resolve_widget_data,
)

_TOP_CATEGORIES_LIMIT = 8
_TOP_DESCRIPTIONS_LIMIT = 8

_INVESTMENT_PARENT_KEYWORDS = frozenset(
    {"investments", "investment", "mutual fund", "mutual funds", "sip"}
)


def _rollup_quarters(by_month: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Roll YYYY-MM debit totals into Indian FY quarters (Q1 Apr–Jun … Q4 Jan–Mar)."""
    totals = {"Q1": 0.0, "Q2": 0.0, "Q3": 0.0, "Q4": 0.0}
    quarter_months = {
        "Q1": "Apr–Jun",
        "Q2": "Jul–Sep",
        "Q3": "Oct–Dec",
        "Q4": "Jan–Mar",
    }
    for row in by_month:
        label = str(row.get("label", ""))
        parts = label.split("-")
        if len(parts) != 2:
            continue
        try:
            month = int(parts[1])
        except ValueError:
            continue
        debit = float(row.get("debit", row.get("value", 0)) or 0)
        if 4 <= month <= 6:
            totals["Q1"] += debit
        elif 7 <= month <= 9:
            totals["Q2"] += debit
        elif 10 <= month <= 12:
            totals["Q3"] += debit
        else:
            totals["Q4"] += debit
    return [
        {"label": q, "debit": totals[q], "months": quarter_months[q]}
        for q in ("Q1", "Q2", "Q3", "Q4")
    ]


def _resolve_top_descriptions(
    db: Session,
    user_id: str,
    *,
    date_from: date | None,
    date_to: date | None,
    bank_name: str | None,
    parent_category: str | None,
    sub_categories: list[str] | None,
) -> list[dict[str, Any]]:
    """Return top debit totals grouped by short_description (fallback description)."""
    clauses = _build_where_clauses(
        user_id=user_id,
        effective_category=None,
        effective_bank_name=bank_name,
        effective_parent_category=parent_category,
        effective_sub_categories=sub_categories,
        transaction_type="debit",
        date_from=date_from,
        date_to=date_to,
    )
    label_col = func.coalesce(
        Transaction.short_description,
        Transaction.description,
    ).label("label")
    labeled_agg = func.sum(Transaction.debit).label("total")
    stmt = (
        select(label_col, labeled_agg)
        .where(*clauses)
        .group_by(label_col)
        .order_by(labeled_agg.desc())
        .limit(_TOP_DESCRIPTIONS_LIMIT)
    )
    rows = db.execute(stmt).all()
    return [
        {"label": str(row.label or "Unknown"), "value": float(row.total or 0)}
        for row in rows
    ]


def _sum_investment_debits(
    db: Session,
    user_id: str,
    *,
    date_from: date | None,
    date_to: date | None,
    bank_name: str | None,
    parent_category: str | None,
    sub_categories: list[str] | None,
) -> float:
    """Sum debits where parent_category matches investment keywords (when not parent-filtered)."""
    if parent_category is not None:
        key = parent_category.strip().lower()
        if key not in _INVESTMENT_PARENT_KEYWORDS:
            return 0.0

    clauses = _build_where_clauses(
        user_id=user_id,
        effective_category=None,
        effective_bank_name=bank_name,
        effective_parent_category=parent_category,
        effective_sub_categories=sub_categories,
        transaction_type="debit",
        date_from=date_from,
        date_to=date_to,
    )
    if parent_category is None:
        parent_lower = func.lower(func.coalesce(Transaction.parent_category, ""))
        clauses.append(parent_lower.in_([k for k in _INVESTMENT_PARENT_KEYWORDS]))
    stmt = select(func.sum(Transaction.debit)).where(*clauses)
    result = db.execute(stmt).scalar()
    return float(result or 0)


def build_dashboard_overview(
    db: Session,
    user_id: str,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    bank_name: str | None = None,
    parent_category: str | None = None,
    sub_categories: list[str] | None = None,
) -> dict[str, Any]:
    """Build a single overview payload for the editorial dashboard cards.

    Args:
        db: Active SQLAlchemy session (RLS user must be set).
        user_id: Tenant id.
        date_from: Inclusive lower date bound.
        date_to: Inclusive upper date bound.
        bank_name: Optional bank filter.
        parent_category: Optional parent category filter.
        sub_categories: Optional sub-category filters.

    Returns:
        Dict with totals, by_month, by_quarter, top_categories, top_descriptions,
        and investment_debits.
    """
    common = {
        "user_id": user_id,
        "db": db,
        "date_from": date_from,
        "date_to": date_to,
        "bank_name": bank_name,
        "parent_category": parent_category,
        "sub_categories": sub_categories,
    }

    credits = resolve_widget_data(
        config={
            "aggregation": "sum",
            "field": "credit",
            "filters": {"transaction_type": "credit"},
            "format": "currency",
        },
        **common,
    )
    debits = resolve_widget_data(
        config={
            "aggregation": "sum",
            "field": "debit",
            "filters": {"transaction_type": "debit"},
            "format": "currency",
        },
        **common,
    )
    credit_count = resolve_widget_data(
        config={
            "aggregation": "count",
            "field": "credit",
            "filters": {"transaction_type": "credit"},
            "format": "number",
        },
        **common,
    )
    debit_count = resolve_widget_data(
        config={
            "aggregation": "count",
            "field": "debit",
            "filters": {"transaction_type": "debit"},
            "format": "number",
        },
        **common,
    )

    credit_val = float(credits["value"])  # type: ignore[index]
    debit_val = float(debits["value"])  # type: ignore[index]

    by_month_raw = resolve_widget_data(
        config={
            "aggregation": "sum",
            "field": "debit",
            "group_by": "month",
            "filters": {"transaction_type": "debit"},
        },
        **common,
    )
    assert isinstance(by_month_raw, list)
    by_month = [
        {"label": str(row["label"]), "debit": float(row["value"])}
        for row in by_month_raw
    ]

    top_categories_raw = resolve_widget_data(
        config={
            "aggregation": "sum",
            "field": "debit",
            "group_by": "category",
            "filters": {"transaction_type": "debit"},
        },
        **common,
    )
    assert isinstance(top_categories_raw, list)
    top_categories = [
        {"label": str(row["label"] or "Uncategorized"), "value": float(row["value"])}
        for row in top_categories_raw[:_TOP_CATEGORIES_LIMIT]
    ]

    top_descriptions = _resolve_top_descriptions(
        db,
        user_id,
        date_from=date_from,
        date_to=date_to,
        bank_name=bank_name,
        parent_category=parent_category,
        sub_categories=sub_categories,
    )

    investment_debits = _sum_investment_debits(
        db,
        user_id,
        date_from=date_from,
        date_to=date_to,
        bank_name=bank_name,
        parent_category=parent_category,
        sub_categories=sub_categories,
    )

    return {
        "totals": {
            "credits": credit_val,
            "debits": debit_val,
            "credit_count": int(credit_count["value"]),  # type: ignore[index]
            "debit_count": int(debit_count["value"]),  # type: ignore[index]
            "net": credit_val - debit_val,
        },
        "by_month": by_month,
        "by_quarter": _rollup_quarters(by_month),
        "top_categories": top_categories,
        "top_descriptions": top_descriptions,
        "investment_debits": investment_debits,
    }
