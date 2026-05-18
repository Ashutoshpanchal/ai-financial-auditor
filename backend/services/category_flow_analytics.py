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
from backend.services.category_master_service import get_merged_grouped_master

UNCATEGORIZED_LABEL = "Uncategorized"
MAX_CATEGORY_FLOW_ROWS = 5000

FlowMode = Literal["debit", "credit", "both"]


def _coalesce_parent() -> Any:
    """SQL expression: parent_category or 'Uncategorized'."""
    return func.coalesce(Transaction.parent_category, literal(UNCATEGORIZED_LABEL))


def _coalesce_sub() -> Any:
    """SQL expression: sub_category or 'Uncategorized'."""
    return func.coalesce(Transaction.sub_category, literal(UNCATEGORIZED_LABEL))


def _optional_bank_clause(bank_name: str) -> Any | None:
    """Return ilike filter on bank_name when ``bank_name`` is non-empty after strip."""
    needle = bank_name.strip()
    if not needle:
        return None
    return Transaction.bank_name.ilike(f"%{needle}%")


def _build_filters(
    user_id: str,
    date_from: date,
    date_to: date,
    parent_category: str,
    sub_categories: list[str] | None,
    bank_name: str = "",
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
    bank_clause = _optional_bank_clause(bank_name)
    if bank_clause is not None:
        clauses.append(bank_clause)
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
    bank_name: str = "",
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
        bank_name: Optional substring filter on ``bank_name`` (ilike).

    Returns:
        Dict with ``rows``, ``totals``, ``truncated``, ``truncated_reason`` (optional).

    Raises:
        ValueError: If ``parent_category`` is empty after strip.
    """
    parent_category = parent_category.strip()
    if not parent_category:
        raise ValueError("parent_category is required.")

    clauses = _build_filters(
        user_id, date_from, date_to, parent_category, sub_categories, bank_name
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
    bank_name: str = "",
) -> list[Any]:
    """WHERE clauses for aggregates across all primary categories."""
    clauses: list[Any] = [
        Transaction.user_id == user_id,
        Transaction.transaction_date >= date_from,
        Transaction.transaction_date <= date_to,
    ]
    bank_clause = _optional_bank_clause(bank_name)
    if bank_clause is not None:
        clauses.append(bank_clause)
    return clauses


def compute_category_flow_by_parent_month(
    db: Session,
    user_id: str,
    date_from: date,
    date_to: date,
    mode: FlowMode = "both",
    bank_name: str = "",
) -> dict[str, Any]:
    """Aggregate debit/credit/count by (parent_category, YYYY-MM) for all parents.

    Used for PC-level month comparison charts (no single-parent filter).

    Args:
        db: Active SQLAlchemy session (caller sets RLS).
        user_id: Tenant id.
        date_from: Inclusive lower bound on ``transaction_date``.
        date_to: Inclusive upper bound on ``transaction_date``.
        mode: ``debit`` / ``credit`` / ``both`` for HAVING on grouped sums.
        bank_name: Optional substring filter on ``bank_name`` (ilike).

    Returns:
        Dict with ``rows`` (no ``sub_category``), ``totals``, ``truncated``, optional reason.
    """
    clauses = _build_filters_all_parents(user_id, date_from, date_to, bank_name)

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


def compute_category_flow_metadata(
    db: Session,
    user_id: str,
    date_from: date,
    date_to: date,
    bank_name: str = "",
) -> dict[str, Any]:
    """Return scope metadata: months, years, total paginated rows, parent categories.

    Args:
        db: Active SQLAlchemy session (caller sets RLS).
        user_id: Tenant id.
        date_from: Inclusive lower bound on transaction_date.
        date_to: Inclusive upper bound on transaction_date.
        bank_name: Optional substring filter on ``bank_name`` (ilike).

    Returns:
        Dict with months_available (YYYY-MM list), years, total_rows (count of distinct
        (parent, month) groups), parent_categories (list of all parents).
    """
    clauses = _build_filters_all_parents(user_id, date_from, date_to, bank_name)
    month_expr = func.to_char(Transaction.transaction_date, "YYYY-MM")

    # Distinct months (sorted)
    months_stmt = (
        select(month_expr.label("month"))
        .where(*clauses)
        .distinct()
        .order_by(month_expr)
    )
    months: list[str] = [row.month for row in db.execute(months_stmt).all()]
    years: list[int] = sorted({int(m[:4]) for m in months})

    # Count of distinct (parent_category, month) groups — this is the total paginated rows
    sub = (
        select(
            _coalesce_parent().label("pc"),
            month_expr.label("month"),
        )
        .where(*clauses)
        .group_by(_coalesce_parent(), month_expr)
        .subquery()
    )
    total_rows: int = db.scalar(select(func.count()).select_from(sub)) or 0

    # Distinct parent categories (sorted)
    parents_stmt = (
        select(_coalesce_parent().label("parent_category"))
        .where(*clauses)
        .distinct()
        .order_by(_coalesce_parent())
    )
    parent_categories: list[str] = [
        r.parent_category for r in db.execute(parents_stmt).all()
    ]

    return {
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "months_available": months,
        "years": years,
        "total_rows": total_rows,
        "parent_categories": parent_categories,
    }


def compute_category_flow_by_parent_paginated(
    db: Session,
    user_id: str,
    date_from: date,
    date_to: date,
    mode: FlowMode = "both",
    month_cursor: str | None = None,
    limit: int = 50,
    bank_name: str = "",
) -> dict[str, Any]:
    """Paginate (parent_category, month) aggregates via a YYYY-MM month cursor.

    Fetches limit+1 rows to detect has_more. next_cursor is the month of
    the first row NOT included in this page.

    Args:
        db: Active SQLAlchemy session (caller sets RLS).
        user_id: Tenant id.
        date_from: Inclusive lower bound on transaction_date.
        date_to: Inclusive upper bound on transaction_date.
        mode: debit / credit / both for HAVING on grouped sums.
        month_cursor: Start from this YYYY-MM month (inclusive). None = start from beginning.
        limit: Max rows to return (1-200).
        bank_name: Optional substring filter on ``bank_name`` (ilike).

    Returns:
        Dict with rows (list of aggregates), pagination metadata (current_cursor, next_cursor,
        has_more, limit, rows_returned).
    """
    clauses = _build_filters_all_parents(user_id, date_from, date_to, bank_name)
    month_expr = func.to_char(Transaction.transaction_date, "YYYY-MM")

    if month_cursor:
        clauses.append(month_expr >= month_cursor)

    parent_expr = _coalesce_parent().label("parent_category")
    month_labeled = month_expr.label("month")
    debit_sum = func.sum(Transaction.debit).label("debit_total")
    credit_sum = func.sum(Transaction.credit).label("credit_total")
    txn_count = func.count(Transaction.id).label("txn_count")

    stmt = (
        select(parent_expr, month_labeled, debit_sum, credit_sum, txn_count)
        .where(*clauses)
        .group_by(parent_expr, month_labeled)
        .order_by(month_labeled.asc(), parent_expr.asc())
    )
    having = _having_for_mode(mode)
    if having is not None:
        stmt = stmt.having(having)

    raw_rows = db.execute(stmt.limit(limit + 1)).all()

    has_more = len(raw_rows) > limit
    next_cursor: str | None = raw_rows[limit].month if has_more else None
    if has_more:
        raw_rows = raw_rows[:limit]

    rows: list[dict[str, Any]] = [
        {
            "parent_category": r.parent_category,
            "month": r.month,
            "debit_total": float(r.debit_total or 0),
            "credit_total": float(r.credit_total or 0),
            "txn_count": int(r.txn_count or 0),
        }
        for r in raw_rows
    ]

    return {
        "rows": rows,
        "pagination": {
            "current_cursor": month_cursor,
            "next_cursor": next_cursor,
            "has_more": has_more,
            "limit": limit,
            "rows_returned": len(rows),
        },
    }


def compute_transaction_date_scope(
    db: Session,
    user_id: str,
) -> dict[str, Any]:
    """Return filter metadata: date bounds, months, banks, and merged category master.

    Args:
        db: Active SQLAlchemy session (caller sets RLS).
        user_id: Tenant id.

    Returns:
        Dict with ``min_date``, ``max_date`` (ISO strings or null), sorted
        ``months_with_data`` (YYYY-MM), ``has_transactions``, sorted distinct
        ``bank_names`` (non-empty trimmed), and ``category_master`` (parent ->
        list of ``{id, sub_category, is_global}``), same shape as
        ``GET /categories/master/split`` merged view.
    """
    clauses: list[Any] = [Transaction.user_id == user_id]

    min_date: date | None = db.scalar(
        select(func.min(Transaction.transaction_date)).where(*clauses)
    )
    max_date: date | None = db.scalar(
        select(func.max(Transaction.transaction_date)).where(*clauses)
    )

    month_expr = func.to_char(Transaction.transaction_date, "YYYY-MM")
    months_stmt = (
        select(month_expr.label("month"))
        .where(*clauses)
        .distinct()
        .order_by(month_expr)
    )
    months_with_data: list[str] = [row.month for row in db.execute(months_stmt).all()]

    trimmed_bank = func.nullif(func.trim(Transaction.bank_name), "")
    banks_stmt = (
        select(trimmed_bank.label("bank_name"))
        .where(*clauses)
        .where(trimmed_bank.isnot(None))
        .distinct()
        .order_by(trimmed_bank)
    )
    bank_names: list[str] = [
        str(row.bank_name) for row in db.execute(banks_stmt).all() if row.bank_name
    ]

    category_master = get_merged_grouped_master(db, user_id)

    return {
        "min_date": min_date.isoformat() if min_date else None,
        "max_date": max_date.isoformat() if max_date else None,
        "months_with_data": months_with_data,
        "has_transactions": min_date is not None,
        "bank_names": bank_names,
        "category_master": category_master,
    }
