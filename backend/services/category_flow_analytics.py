"""Aggregate transactions by parent category, calendar month, and sub-category.

Used by the Category Insights UI for multi-year PC-by-month-by-SC comparison tables
(and future charts). All queries are scoped by ``user_id`` (RLS-friendly).
"""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from sqlalchemy import func, literal, select
from sqlalchemy.orm import Session

from backend.models.transaction import Transaction

UNCATEGORIZED_LABEL = "Uncategorized"
MAX_CATEGORY_FLOW_ROWS = 5000

FlowMode = Literal["debit", "credit", "both"]


def _coalesce_parent() -> Any:
    """SQL expression: parent_category or 'Uncategorized'."""
    return func.coalesce(Transaction.parent_category, literal(UNCATEGORIZED_LABEL))


def _coalesce_sub() -> Any:
    """SQL expression: sub_category or 'Uncategorized'."""
    return func.coalesce(Transaction.sub_category, literal(UNCATEGORIZED_LABEL))


def _build_filters(
    user_id: str,
    date_from: date,
    date_to: date,
    parent_category: str,
    sub_categories: list[str] | None,
) -> list[Any]:
    """Return WHERE clauses for category-flow aggregates."""
    clauses: list[Any] = [
        Transaction.user_id == user_id,
        Transaction.transaction_date >= date_from,
        Transaction.transaction_date <= date_to,
        _coalesce_parent() == parent_category,
    ]
    if sub_categories:
        clauses.append(_coalesce_sub().in_(sub_categories))
    return clauses


def _having_for_mode(mode: FlowMode) -> Any | None:
    """Optional HAVING clause so rows match the active flow mode."""
    if mode == "debit":
        return func.sum(Transaction.debit) > 0
    if mode == "credit":
        return func.sum(Transaction.credit) > 0
    return None


def compute_category_flow(
    db: Session,
    user_id: str,
    date_from: date,
    date_to: date,
    parent_category: str,
    sub_categories: list[str] | None,
    mode: FlowMode = "both",
) -> dict[str, Any]:
    """Aggregate debit/credit/count by (parent, YYYY-MM, sub) for one primary category.

    Args:
        db: Active SQLAlchemy session (caller sets RLS).
        user_id: Tenant id — only this user's rows are included.
        date_from: Inclusive lower bound on ``transaction_date``.
        date_to: Inclusive upper bound on ``transaction_date``.
        parent_category: Primary category label (matches coalesced ``parent_category``).
        sub_categories: If non-empty, restrict to these sub-categories (coalesced labels).
        mode: ``debit`` / ``credit`` / ``both`` — filters grouped rows with zero relevant totals.

    Returns:
        Dict with ``rows``, ``totals``, ``truncated``, ``truncated_reason`` (optional).

    Raises:
        ValueError: If ``parent_category`` is empty after strip.
    """
    parent_category = parent_category.strip()
    if not parent_category:
        raise ValueError("parent_category is required.")

    clauses = _build_filters(
        user_id, date_from, date_to, parent_category, sub_categories
    )

    parent_expr = _coalesce_parent().label("parent_category")
    month_expr = func.to_char(Transaction.transaction_date, "YYYY-MM").label("month")
    sub_expr = _coalesce_sub().label("sub_category")
    debit_sum = func.sum(Transaction.debit).label("debit_total")
    credit_sum = func.sum(Transaction.credit).label("credit_total")
    txn_count = func.count(Transaction.id).label("txn_count")

    stmt_totals = select(debit_sum, credit_sum, txn_count).where(*clauses)
    total_row = db.execute(stmt_totals).one()
    totals = {
        "debit": float(total_row.debit_total or 0),
        "credit": float(total_row.credit_total or 0),
        "txn_count": int(total_row.txn_count or 0),
    }

    stmt_grouped = (
        select(parent_expr, month_expr, sub_expr, debit_sum, credit_sum, txn_count)
        .where(*clauses)
        .group_by(parent_expr, month_expr, sub_expr)
        .order_by(month_expr.asc(), sub_expr.asc())
    )
    having = _having_for_mode(mode)
    if having is not None:
        stmt_grouped = stmt_grouped.having(having)

    stmt_limited = stmt_grouped.limit(MAX_CATEGORY_FLOW_ROWS + 1)
    raw_rows = db.execute(stmt_limited).all()

    truncated = len(raw_rows) > MAX_CATEGORY_FLOW_ROWS
    if truncated:
        raw_rows = raw_rows[:MAX_CATEGORY_FLOW_ROWS]

    rows: list[dict[str, Any]] = [
        {
            "parent_category": row.parent_category,
            "month": row.month,
            "sub_category": row.sub_category,
            "debit_total": float(row.debit_total or 0),
            "credit_total": float(row.credit_total or 0),
            "txn_count": int(row.txn_count or 0),
        }
        for row in raw_rows
    ]

    out: dict[str, Any] = {
        "rows": rows,
        "totals": totals,
        "truncated": truncated,
    }
    if truncated:
        out["truncated_reason"] = (
            f"More than {MAX_CATEGORY_FLOW_ROWS} distinct (month, sub-category) "
            "groups matched; results are truncated. Narrow the date range or sub-categories."
        )
    return out


def _build_filters_all_parents(
    user_id: str,
    date_from: date,
    date_to: date,
) -> list[Any]:
    """WHERE clauses for aggregates across all primary categories."""
    return [
        Transaction.user_id == user_id,
        Transaction.transaction_date >= date_from,
        Transaction.transaction_date <= date_to,
    ]


def compute_category_flow_by_parent_month(
    db: Session,
    user_id: str,
    date_from: date,
    date_to: date,
    mode: FlowMode = "both",
) -> dict[str, Any]:
    """Aggregate debit/credit/count by (parent_category, YYYY-MM) for all parents.

    Used for PC-level month comparison charts (no single-parent filter).

    Args:
        db: Active SQLAlchemy session (caller sets RLS).
        user_id: Tenant id.
        date_from: Inclusive lower bound on ``transaction_date``.
        date_to: Inclusive upper bound on ``transaction_date``.
        mode: ``debit`` / ``credit`` / ``both`` for HAVING on grouped sums.

    Returns:
        Dict with ``rows`` (no ``sub_category``), ``totals``, ``truncated``, optional reason.
    """
    clauses = _build_filters_all_parents(user_id, date_from, date_to)

    parent_expr = _coalesce_parent().label("parent_category")
    month_expr = func.to_char(Transaction.transaction_date, "YYYY-MM").label("month")
    debit_sum = func.sum(Transaction.debit).label("debit_total")
    credit_sum = func.sum(Transaction.credit).label("credit_total")
    txn_count = func.count(Transaction.id).label("txn_count")

    stmt_totals = select(debit_sum, credit_sum, txn_count).where(*clauses)
    total_row = db.execute(stmt_totals).one()
    totals = {
        "debit": float(total_row.debit_total or 0),
        "credit": float(total_row.credit_total or 0),
        "txn_count": int(total_row.txn_count or 0),
    }

    stmt_grouped = (
        select(parent_expr, month_expr, debit_sum, credit_sum, txn_count)
        .where(*clauses)
        .group_by(parent_expr, month_expr)
        .order_by(month_expr.asc(), parent_expr.asc())
    )
    having = _having_for_mode(mode)
    if having is not None:
        stmt_grouped = stmt_grouped.having(having)

    stmt_limited = stmt_grouped.limit(MAX_CATEGORY_FLOW_ROWS + 1)
    raw_rows = db.execute(stmt_limited).all()

    truncated = len(raw_rows) > MAX_CATEGORY_FLOW_ROWS
    if truncated:
        raw_rows = raw_rows[:MAX_CATEGORY_FLOW_ROWS]

    rows: list[dict[str, Any]] = [
        {
            "parent_category": row.parent_category,
            "month": row.month,
            "debit_total": float(row.debit_total or 0),
            "credit_total": float(row.credit_total or 0),
            "txn_count": int(row.txn_count or 0),
        }
        for row in raw_rows
    ]

    out: dict[str, Any] = {
        "rows": rows,
        "totals": totals,
        "truncated": truncated,
    }
    if truncated:
        out["truncated_reason"] = (
            f"More than {MAX_CATEGORY_FLOW_ROWS} distinct (month, parent_category) "
            "groups matched; results are truncated. Narrow the date range."
        )
    return out
