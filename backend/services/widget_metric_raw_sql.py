"""Minimal sandbox for user-written metric SQL against ``transactions`` only.

For ``raw_metric_sql`` metric widgets: validate a single ``SELECT``, inject a
mandatory ``transactions.user_id`` bind, optionally append dashboard date/bank
/category filters, then execute as a scalar float.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.services.widget_sql_aliases import translate_llm_sql_to_real

_MAX_SQL_LEN = 4096

_DISALLOWED = re.compile(
    r"\b(union|insert|update|delete|drop|alter|truncate|grant|revoke|"
    r"into\s+outfile|copy\s*\(|execute\s+immediate|pg_sleep|information_schema)\b",
    re.IGNORECASE,
)

_JOIN = re.compile(r"\bjoin\b", re.IGNORECASE)

_FROM_TRANSACTIONS = re.compile(r"\bfrom\s+transactions\b", re.IGNORECASE)

_SCOPE_BOUNDARY = re.compile(
    r"\b(group\s+by|having|order\s+by|limit|offset|fetch|for\s+update)\b",
    re.IGNORECASE,
)

_TRAILING_CLAUSE = re.compile(
    r"\b(order\s+by|limit|offset|fetch|for\s+update)\b",
    re.IGNORECASE,
)

# LLM sometimes embeds filter placeholders in SQL; server injects dates via bind params.
_EMBEDDED_DATE_FROM = re.compile(
    r"\s+AND\s+(?:DATE\s*\(\s*)?transaction_date(?:\s*\))?\s*>=\s*'\{\{date_from\}\}'",
    re.IGNORECASE,
)
_EMBEDDED_DATE_TO = re.compile(
    r"\s+AND\s+(?:DATE\s*\(\s*)?transaction_date(?:\s*\))?\s*<=\s*'\{\{date_to\}\}'",
    re.IGNORECASE,
)


def validate_raw_metric_sql(sql: str) -> None:
    """Reject obviously unsafe or unsupported SQL before injection.

    Args:
        sql: User-supplied SQL string.

    Raises:
        ValueError: If the statement cannot be executed in the sandbox.
    """
    stripped = sql.strip()
    if not stripped:
        raise ValueError("raw_metric_sql must not be empty.")
    if len(stripped) > _MAX_SQL_LEN:
        raise ValueError(f"raw_metric_sql exceeds {_MAX_SQL_LEN} characters.")

    if "--" in stripped or "/*" in stripped:
        raise ValueError("SQL comments are not allowed in raw_metric_sql.")

    lowered = stripped.lower()
    if not lowered.startswith("select"):
        raise ValueError("raw_metric_sql must be a single SELECT statement.")

    if _DISALLOWED.search(stripped):
        raise ValueError("Disallowed keyword or construct in raw_metric_sql.")

    core = stripped.rstrip().rstrip(";")
    if ";" in core:
        raise ValueError("Multiple SQL statements are not allowed.")

    if _JOIN.search(stripped):
        raise ValueError("JOIN is not allowed in raw_metric_sql.")

    if not _FROM_TRANSACTIONS.search(stripped):
        raise ValueError(
            "raw_metric_sql must query the transactions table (FROM transactions)."
        )


def _find_trailing_clause_start(sql: str) -> int:
    """Return the index of the first trailing ORDER BY / LIMIT / … clause."""
    lower = sql.lower()
    best = len(sql)
    for m in _TRAILING_CLAUSE.finditer(lower):
        if m.start() < best:
            best = m.start()
    return best


def _scope_end_after_from_transactions(rest: str) -> int:
    """Return index in *rest* (text after ``FROM transactions``) to insert predicates before."""
    best = len(rest)
    for m in _SCOPE_BOUNDARY.finditer(rest):
        if m.start() < best:
            best = m.start()
    depth = 0
    for i, ch in enumerate(rest):
        if ch == "(":
            depth += 1
        elif ch == ")":
            if depth == 0:
                best = min(best, i)
                break
            depth -= 1
    return best


def strip_embedded_sql_placeholders(sql: str) -> str:
    """Remove date placeholder literals from SQL; dates are injected as bind params."""
    cleaned = _EMBEDDED_DATE_FROM.sub("", sql)
    return _EMBEDDED_DATE_TO.sub("", cleaned)


def _inject_predicates_at_transactions_scopes(sql: str, predicates: list[str]) -> str:
    """Insert AND/WHERE predicates at each ``FROM transactions`` scope (not query tail)."""
    if not predicates:
        return sql
    clause = " AND ".join(predicates)
    matches = list(_FROM_TRANSACTIONS.finditer(sql))
    if not matches:
        cut = _find_trailing_clause_start(sql)
        head, tail = sql[:cut], sql[cut:]
        if re.search(r"\bwhere\b", head, re.IGNORECASE):
            return f"{head} AND {clause}{tail}"
        return f"{head} WHERE {clause}{tail}"

    result = sql
    for m in reversed(matches):
        after_from = m.end()
        rest = result[after_from:]
        boundary = _scope_end_after_from_transactions(rest)
        insert_at = after_from + boundary
        segment = result[after_from:insert_at]
        if re.search(r"\bwhere\b", segment, re.IGNORECASE):
            addition = f" AND {clause}"
        else:
            addition = f" WHERE {clause}"
        result = result[:insert_at] + addition + result[insert_at:]
    return result


def inject_user_scope(sql: str, user_id: str) -> tuple[str, dict[str, Any]]:
    """Append ``transactions.user_id = :_widget_uid`` on each ``FROM transactions`` scope.

    Args:
        sql: Stripped, validated SELECT referencing ``transactions``.
        user_id: Tenant id bound as ``:_widget_uid``.

    Returns:
        Tuple of augmented SQL and bind parameters (only ``_widget_uid``).
    """
    stripped = strip_embedded_sql_placeholders(sql.strip().rstrip(";"))
    augmented = _inject_predicates_at_transactions_scopes(
        stripped,
        ["transactions.user_id = :_widget_uid"],
    )
    return augmented, {"_widget_uid": user_id}


def _append_dashboard_filters(
    sql: str,
    params: dict[str, Any],
    *,
    date_from: date | None,
    date_to: date | None,
    bank_name: str | None,
    category: str | None,
    parent_category: str | None,
    sub_category: str | None,
    transaction_type: str | None,
) -> tuple[str, dict[str, Any]]:
    """Append date/bank/category/direction predicates before trailing clauses."""
    fragments: list[str] = []
    if date_from is not None:
        fragments.append("transactions.transaction_date >= :_widget_df")
        params["_widget_df"] = date_from
    if date_to is not None:
        fragments.append("transactions.transaction_date <= :_widget_dt")
        params["_widget_dt"] = date_to
    if bank_name is not None:
        fragments.append("transactions.bank_name = :_widget_bn")
        params["_widget_bn"] = bank_name
    if category is not None:
        fragments.append("transactions.category = :_widget_cat")
        params["_widget_cat"] = category
    if parent_category is not None:
        fragments.append("transactions.parent_category = :_widget_pc")
        params["_widget_pc"] = parent_category
    if sub_category is not None:
        fragments.append("transactions.sub_category = :_widget_sc")
        params["_widget_sc"] = sub_category
    if transaction_type == "credit":
        fragments.append("transactions.credit > 0")
    elif transaction_type == "debit":
        fragments.append("transactions.debit > 0")
    if not fragments:
        return sql, params
    augmented = _inject_predicates_at_transactions_scopes(sql, fragments)
    return augmented, params


def _format_sql_with_binds(sql: str, bind: dict[str, Any]) -> str:
    """Inline bind parameters into SQL for super-admin debug display."""
    result = sql
    for key in sorted(bind.keys(), key=len, reverse=True):
        val = bind[key]
        if isinstance(val, date):
            replacement = f"'{val.isoformat()}'"
        elif isinstance(val, str):
            escaped = val.replace("'", "''")
            replacement = f"'{escaped}'"
        else:
            replacement = repr(val)
        result = result.replace(f":{key}", replacement)
    return result


def build_raw_metric_sql_preview(
    sql: str,
    user_id: str,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    bank_name: str | None = None,
    category: str | None = None,
    parent_category: str | None = None,
    sub_category: str | None = None,
    transaction_type: str | None = None,
) -> str:
    """Build the final sandboxed SQL string without executing it.

    Args:
        sql: Raw or LLM-dummy SQL (translated to real identifiers).
        user_id: Tenant id for scope injection.
        date_from: Optional inclusive lower bound on ``transaction_date``.
        date_to: Optional inclusive upper bound on ``transaction_date``.
        bank_name: Optional bank filter.
        category: Optional legacy category filter.
        parent_category: Optional parent category filter.
        sub_category: Optional sub-category filter.
        transaction_type: Optional ``credit`` or ``debit`` direction filter.

    Returns:
        SQL with user scope and dashboard filters applied (binds inlined).
    """
    real_sql = translate_llm_sql_to_real(sql)
    augmented, bind = inject_user_scope(real_sql, user_id)
    augmented, bind = _append_dashboard_filters(
        augmented,
        bind,
        date_from=date_from,
        date_to=date_to,
        bank_name=bank_name,
        category=category,
        parent_category=parent_category,
        sub_category=sub_category,
        transaction_type=transaction_type,
    )
    return _format_sql_with_binds(augmented, bind)


def execute_raw_metric_sql(
    sql: str,
    user_id: str,
    db: Session,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    bank_name: str | None = None,
    category: str | None = None,
    parent_category: str | None = None,
    sub_category: str | None = None,
    transaction_type: str | None = None,
) -> float:
    """Execute sandboxed metric SQL and return a single numeric scalar.

    Args:
        sql: SELECT that passed ``validate_raw_metric_sql`` (may use LLM dummy names).
        user_id: Tenant id.
        db: SQLAlchemy session.
        date_from: Optional inclusive lower bound on ``transaction_date``.
        date_to: Optional inclusive upper bound on ``transaction_date``.
        bank_name: Optional bank filter.
        category: Optional legacy category filter.
        parent_category: Optional parent category filter.
        sub_category: Optional sub-category filter.
        transaction_type: Optional ``credit`` or ``debit`` direction filter.

    Returns:
        Scalar result coerced to ``float`` (0.0 when NULL).
    """
    real_sql = translate_llm_sql_to_real(sql)
    augmented, bind = inject_user_scope(real_sql, user_id)
    augmented, bind = _append_dashboard_filters(
        augmented,
        bind,
        date_from=date_from,
        date_to=date_to,
        bank_name=bank_name,
        category=category,
        parent_category=parent_category,
        sub_category=sub_category,
        transaction_type=transaction_type,
    )
    print(f"[widget_metric_sql] user_id={user_id}", flush=True)
    print(f"[widget_metric_sql] sql={augmented}", flush=True)
    print(f"[widget_metric_sql] bind={bind}", flush=True)
    result = db.execute(text(augmented), bind).scalar()
    return float(result or 0)
