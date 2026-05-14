"""Widget query service — resolves dashboard widget data from Transaction records.

Supports two output shapes:
  - Metric: a single aggregated scalar value
  - Chart:  a list of (label, value) pairs grouped by month, category, or bank_name
"""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.models.transaction import Transaction

# --------------------------------------------------------------------------- #
# Allowed enum values (domain constants — not config)
# --------------------------------------------------------------------------- #

_ALLOWED_AGGREGATIONS: frozenset[str] = frozenset({"sum", "count", "avg", "max", "min"})
_ALLOWED_FIELDS: frozenset[str] = frozenset({"credit", "debit"})
_ALLOWED_GROUP_BY: frozenset[str] = frozenset({"month", "category", "bank_name"})
_CHART_WIDGET_TYPES: frozenset[str] = frozenset(
    {"bar_chart", "pie_chart", "line_chart"}
)


def validate_widget_query_config(widget_type: str, config: dict[str, Any]) -> None:
    """Validate *config* for a widget of the given *widget_type* before save or preview.

    Ensures aggregation/field/group_by enums match ``resolve_widget_data`` rules and
    that ``group_by`` presence aligns with metric vs chart widget types.

    Args:
        widget_type: One of metric, bar_chart, pie_chart, line_chart.
        config:       Same shape as accepted by ``resolve_widget_data``.

    Raises:
        ValueError: If any rule is violated.
    """
    if widget_type not in ({"metric"} | _CHART_WIDGET_TYPES):
        raise ValueError(
            f"Invalid widget_type '{widget_type}'. "
            f"Allowed: metric, {', '.join(sorted(_CHART_WIDGET_TYPES))}"
        )

    # raw_metric_sql support disabled — widget_metric_raw_sql module not yet implemented
    # raw_sql = config.get("raw_metric_sql")
    # if isinstance(raw_sql, str) and raw_sql.strip():
    #     if widget_type != "metric":
    #         raise ValueError("raw_metric_sql is only supported for metric widgets.")
    #     if config.get("group_by") is not None:
    #         raise ValueError("Do not set group_by when using raw_metric_sql.")
    #     validate_raw_metric_sql(raw_sql.strip())
    #     return

    aggregation = config.get("aggregation", "")
    field = config.get("field", "")
    group_by: str | None = config.get("group_by")

    if aggregation not in _ALLOWED_AGGREGATIONS:
        raise ValueError(
            f"Invalid aggregation '{aggregation}'. "
            f"Allowed values: {sorted(_ALLOWED_AGGREGATIONS)}"
        )
    if field not in _ALLOWED_FIELDS:
        raise ValueError(
            f"Invalid field '{field}'. Allowed values: {sorted(_ALLOWED_FIELDS)}"
        )
    if group_by is not None and group_by not in _ALLOWED_GROUP_BY:
        raise ValueError(
            f"Invalid group_by '{group_by}'. "
            f"Allowed values: {sorted(_ALLOWED_GROUP_BY)}"
        )

    cfg_filters: dict[str, Any] = config.get("filters", {}) or {}
    txn_type = cfg_filters.get("transaction_type")
    if txn_type is not None and txn_type not in ("credit", "debit"):
        raise ValueError(
            f"Invalid filters.transaction_type '{txn_type}'. "
            "Allowed: 'credit', 'debit', or omit."
        )

    if widget_type == "metric":
        if group_by is not None:
            raise ValueError("Metric widgets must not include 'group_by'.")
    elif widget_type in _CHART_WIDGET_TYPES and group_by is None:
        raise ValueError(
            f"Widget type '{widget_type}' requires 'group_by' "
            f"({', '.join(sorted(_ALLOWED_GROUP_BY))})."
        )


def describe_widget_query_human(config: dict[str, Any]) -> str:
    """Build a read-only pseudo-SQL description using an abstract table name.

    Omits real table names; tenant scope is noted as applied server-side only.

    Args:
        config: Widget query_config dict.

    Returns:
        A short multi-line human-readable description for UI display.
    """
    # raw_metric_sql support disabled — widget_metric_raw_sql module not yet implemented
    # raw_sql = config.get("raw_metric_sql")
    # if isinstance(raw_sql, str) and raw_sql.strip():
    #     return raw_sql.strip()

    aggregation = config.get("aggregation", "?")
    field = config.get("field", "?")
    group_by: str | None = config.get("group_by")
    cfg_filters: dict[str, Any] = config.get("filters", {}) or {}

    select_expr = f"{aggregation}({field})"
    if group_by:
        select_expr = f"{group_by}, {select_expr}"

    lines = [f"SELECT {select_expr}", "FROM your_transactions"]

    where_parts: list[str] = ["(only your transactions — applied by the app)"]
    tt = cfg_filters.get("transaction_type")
    if tt == "credit":
        where_parts.append("credit > 0")
    elif tt == "debit":
        where_parts.append("debit > 0")
    if cfg_filters.get("category"):
        where_parts.append(f"category = '{cfg_filters['category']}'")
    if cfg_filters.get("bank_name"):
        where_parts.append(f"bank_name = '{cfg_filters['bank_name']}'")

    lines.append("WHERE " + " AND ".join(where_parts))

    return "\n".join(lines)


def resolve_widget_data(
    config: dict[str, Any],
    user_id: str,
    db: Session,
    date_from: date | None = None,
    date_to: date | None = None,
    bank_name: str | None = None,
    category: str | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
    """Resolve dashboard widget data by executing the configured aggregation query.

    Reads aggregation config, applies config-level and global-level filters, then
    executes a SQLAlchemy query against the Transaction table.  Returns either a
    single metric dict or a list of chart-row dicts depending on whether
    ``config["group_by"]`` is present.

    Args:
        config:    Widget configuration dict.  Expected keys:
                     - ``aggregation`` (str, required): one of "sum", "count", "avg",
                       "max", "min"
                     - ``field`` (str, required): one of "credit", "debit"
                     - ``group_by`` (str, optional): one of "month", "category",
                       "bank_name" — presence triggers chart mode
                     - ``filters`` (dict, optional): ``category``, ``bank_name``,
                       ``transaction_type`` ("credit" | "debit")
                     - ``format`` (str, optional): hint for metric formatting
                       (e.g. "currency", "number")
        user_id:   Row-level tenant filter — only this user's transactions are touched.
        db:        SQLAlchemy ORM Session (injected via FastAPI dependency).
        date_from: Inclusive lower bound on ``Transaction.transaction_date``.
        date_to:   Inclusive upper bound on ``Transaction.transaction_date``.
        bank_name: Global bank filter (overrides ``config["filters"]["bank_name"]``).
        category:  Global category filter (overrides ``config["filters"]["category"]``).

    Returns:
        Metric mode  -> ``{"value": float, "format": str}``
        Chart mode   -> ``[{"label": str, "value": float}, ...]``

    Raises:
        ValueError: If ``aggregation`` or ``field`` in *config* are not in their
                    respective allowed sets, or if ``group_by`` is present but not
                    in the allowed set.
    """
    # raw_metric_sql support disabled — widget_metric_raw_sql module not yet implemented
    # raw_sql = config.get("raw_metric_sql")
    # if isinstance(raw_sql, str) and raw_sql.strip():
    #     group_by: str | None = config.get("group_by")
    #     if group_by is not None:
    #         raise ValueError("raw_metric_sql cannot be combined with group_by.")
    #     value = execute_raw_metric_sql(raw_sql.strip(), user_id, db)
    #     return {"value": value, "format": config.get("format", "number")}

    aggregation = config.get("aggregation", "")
    field = config.get("field", "")
    group_by: str | None = config.get("group_by")

    # ------------------------------------------------------------------ #
    # 1. Validate enum params
    # ------------------------------------------------------------------ #
    if aggregation not in _ALLOWED_AGGREGATIONS:
        raise ValueError(
            f"Invalid aggregation '{aggregation}'. "
            f"Allowed values: {sorted(_ALLOWED_AGGREGATIONS)}"
        )
    if field not in _ALLOWED_FIELDS:
        raise ValueError(
            f"Invalid field '{field}'. Allowed values: {sorted(_ALLOWED_FIELDS)}"
        )
    if group_by is not None and group_by not in _ALLOWED_GROUP_BY:
        raise ValueError(
            f"Invalid group_by '{group_by}'. "
            f"Allowed values: {sorted(_ALLOWED_GROUP_BY)}"
        )

    # ------------------------------------------------------------------ #
    # 2. Resolve the target column for the aggregation
    # ------------------------------------------------------------------ #
    target_col = Transaction.credit if field == "credit" else Transaction.debit

    # ------------------------------------------------------------------ #
    # 3. Build aggregation SQLAlchemy column expression
    # ------------------------------------------------------------------ #
    agg_map: dict[str, Any] = {
        "sum": func.sum(target_col),
        "count": func.count(Transaction.id),
        "avg": func.avg(target_col),
        "max": func.max(target_col),
        "min": func.min(target_col),
    }
    agg_col = agg_map[aggregation]

    # ------------------------------------------------------------------ #
    # 4. Parse config-level filters (global params may override below)
    # ------------------------------------------------------------------ #
    cfg_filters: dict[str, Any] = config.get("filters", {}) or {}

    # Global params win over config-level filters when both are set
    effective_category: str | None = (
        category if category is not None else cfg_filters.get("category")
    )
    effective_bank_name: str | None = (
        bank_name if bank_name is not None else cfg_filters.get("bank_name")
    )
    transaction_type: str | None = cfg_filters.get("transaction_type")

    # ------------------------------------------------------------------ #
    # 5. Dispatch to metric or chart branch
    # ------------------------------------------------------------------ #
    if group_by is None:
        return _resolve_metric(
            db=db,
            user_id=user_id,
            agg_col=agg_col,
            effective_category=effective_category,
            effective_bank_name=effective_bank_name,
            transaction_type=transaction_type,
            date_from=date_from,
            date_to=date_to,
            fmt=config.get("format", "number"),
        )

    return _resolve_chart(
        db=db,
        user_id=user_id,
        agg_col=agg_col,
        group_by=group_by,
        effective_category=effective_category,
        effective_bank_name=effective_bank_name,
        transaction_type=transaction_type,
        date_from=date_from,
        date_to=date_to,
    )


# --------------------------------------------------------------------------- #
# Internal helpers
# --------------------------------------------------------------------------- #


def _build_where_clauses(
    user_id: str,
    effective_category: str | None,
    effective_bank_name: str | None,
    transaction_type: str | None,
    date_from: date | None,
    date_to: date | None,
) -> list[Any]:
    """Assemble the list of SQLAlchemy WHERE predicates from all active filters.

    Args:
        user_id:              Mandatory tenant filter.
        effective_category:   Optional category equality filter.
        effective_bank_name:  Optional bank_name equality filter.
        transaction_type:     Optional direction filter — "credit" or "debit".
        date_from:            Optional inclusive lower date bound.
        date_to:              Optional inclusive upper date bound.

    Returns:
        List of SQLAlchemy column expressions ready to unpack into ``.where(*clauses)``.
    """
    clauses: list[Any] = [Transaction.user_id == user_id]

    if effective_category is not None:
        clauses.append(Transaction.category == effective_category)
    if effective_bank_name is not None:
        clauses.append(Transaction.bank_name == effective_bank_name)
    if transaction_type == "credit":
        clauses.append(Transaction.credit > 0)
    elif transaction_type == "debit":
        clauses.append(Transaction.debit > 0)
    if date_from is not None:
        clauses.append(Transaction.transaction_date >= date_from)
    if date_to is not None:
        clauses.append(Transaction.transaction_date <= date_to)

    return clauses


def _resolve_metric(
    db: Session,
    user_id: str,
    agg_col: Any,
    effective_category: str | None,
    effective_bank_name: str | None,
    transaction_type: str | None,
    date_from: date | None,
    date_to: date | None,
    fmt: str,
) -> dict[str, Any]:
    """Execute a scalar aggregation and return a metric dict.

    Args:
        db:                   Active SQLAlchemy session.
        user_id:              Tenant filter value.
        agg_col:              Pre-built SQLAlchemy aggregation expression.
        effective_category:   Resolved category filter (global wins over config).
        effective_bank_name:  Resolved bank_name filter (global wins over config).
        transaction_type:     Optional direction filter from config filters.
        date_from:            Optional lower date bound.
        date_to:              Optional upper date bound.
        fmt:                  Format hint string from config (e.g. "currency").

    Returns:
        ``{"value": float, "format": str}``
    """
    clauses = _build_where_clauses(
        user_id=user_id,
        effective_category=effective_category,
        effective_bank_name=effective_bank_name,
        transaction_type=transaction_type,
        date_from=date_from,
        date_to=date_to,
    )

    stmt = select(agg_col).where(*clauses)
    result = db.execute(stmt).scalar()
    return {"value": float(result or 0), "format": fmt}


def _resolve_chart(
    db: Session,
    user_id: str,
    agg_col: Any,
    group_by: str,
    effective_category: str | None,
    effective_bank_name: str | None,
    transaction_type: str | None,
    date_from: date | None,
    date_to: date | None,
) -> list[dict[str, Any]]:
    """Execute a grouped aggregation and return a list of chart row dicts.

    Args:
        db:                   Active SQLAlchemy session.
        user_id:              Tenant filter value.
        agg_col:              Pre-built SQLAlchemy aggregation expression.
        group_by:             Grouping dimension — "month", "category", or "bank_name".
        effective_category:   Resolved category filter.
        effective_bank_name:  Resolved bank_name filter.
        transaction_type:     Optional direction filter from config filters.
        date_from:            Optional lower date bound.
        date_to:              Optional upper date bound.

    Returns:
        List of ``{"label": str, "value": float}`` dicts, ordered by month ASC
        (for month grouping) or aggregation value DESC (for category/bank_name).
    """
    clauses = _build_where_clauses(
        user_id=user_id,
        effective_category=effective_category,
        effective_bank_name=effective_bank_name,
        transaction_type=transaction_type,
        date_from=date_from,
        date_to=date_to,
    )

    labeled_agg = agg_col.label("total")

    if group_by == "month":
        group_col = func.to_char(Transaction.transaction_date, "YYYY-MM").label("month")
        stmt = (
            select(group_col, labeled_agg)
            .where(*clauses)
            .group_by(group_col)
            .order_by(group_col.asc())
        )
        rows = db.execute(stmt).all()
        return [{"label": row.month, "value": float(row.total or 0)} for row in rows]

    # category or bank_name grouping.
    # We assign the ORM column to an Any-typed intermediate first so that the
    # subsequent .label() call is made on a value pyright already treats as Any,
    # avoiding reportUnknownMemberType on Mapped[str | None] / Mapped[str] columns.
    if group_by == "category":
        _raw_col: Any = Transaction.category
    else:  # bank_name
        _raw_col = Transaction.bank_name
    group_col: Any = _raw_col.label("label")

    stmt = (
        select(group_col, labeled_agg)
        .where(*clauses)
        .group_by(group_col)
        .order_by(labeled_agg.desc())
    )
    rows = db.execute(stmt).all()
    return [{"label": row.label, "value": float(row.total or 0)} for row in rows]
