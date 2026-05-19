"""Execute resolved Widget Studio SQL with parameterised filters and validation."""

from __future__ import annotations

import logging
import re
import time
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.services.widget_metric_raw_sql import (
    _append_dashboard_filters,
    inject_user_scope,
    strip_embedded_sql_placeholders,
    validate_raw_metric_sql,
)
from backend.widget_studio.query_translator import (
    translate_abstract_sql,
    validate_resolved_sql,
)
from backend.widget_studio.sql_placeholders import strip_llm_embedded_filters
from backend.widget_studio.vocabulary import GENERIC_DB_ERROR, PLACEHOLDER_USER_ID

logger = logging.getLogger(__name__)

_EMBEDDED_USER_PLACEHOLDER = re.compile(
    r"\b(?:transactions\.)?user_id\s*=\s*'\{\{user_id\}\}'",
    re.IGNORECASE,
)


class WidgetQueryExecutionError(Exception):
    """Raised when query execution fails; carries a safe user message."""

    def __init__(self, user_message: str, internal: str | None = None) -> None:
        super().__init__(user_message)
        self.user_message = user_message
        self.internal = internal


def _normalize_banks(
    bank: str | None,
    banks: list[str] | None,
) -> list[str] | None:
    """Return a non-empty list of bank names or None when no bank filter applies."""
    names: list[str] = []
    if banks:
        names.extend(b.strip() for b in banks if b and b.strip())
    elif bank and bank.strip():
        names.append(bank.strip())
    return names or None


def prepare_resolved_sql(
    resolved_template: str,
    user_id: str,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    bank: str | None = None,
    banks: list[str] | None = None,
    parent_category: str | None = None,
    sub_categories: list[str] | None = None,
) -> tuple[str, dict[str, Any]]:
    """Build parameterised SQL and bind dict from a resolved query template.

    Args:
        resolved_template: SQL with real or abstract identifiers and placeholders.
        user_id:           Authenticated user id (never from client).
        date_from:         Optional inclusive start date.
        date_to:           Optional inclusive end date.
        bank:              Optional single bank_name filter (legacy).
        banks:             Optional multi bank filter.
        parent_category:   Optional parent category filter from FilterBar.
        sub_categories:    Optional sub-category filters (``IN`` when multiple).

    Returns:
        Tuple of executable SQL and bind parameters.
    """
    effective_banks = _normalize_banks(bank, banks)
    sql = translate_abstract_sql(resolved_template)
    validate_resolved_sql(sql)
    sql = strip_llm_embedded_filters(
        sql,
        date_from=date_from,
        date_to=date_to,
        bank=bank,
        banks=effective_banks,
    )
    sql = strip_embedded_sql_placeholders(sql)
    sql = _EMBEDDED_USER_PLACEHOLDER.sub("transactions.user_id = :_widget_uid", sql)
    if PLACEHOLDER_USER_ID in sql:
        sql = sql.replace(f"'{PLACEHOLDER_USER_ID}'", ":_widget_uid")
        sql = sql.replace(PLACEHOLDER_USER_ID, ":_widget_uid")

    validate_raw_metric_sql(sql)
    augmented, bind = inject_user_scope(sql, user_id)
    pc = (
        parent_category.strip() if parent_category and parent_category.strip() else None
    )
    subs = [s.strip() for s in (sub_categories or []) if s and s.strip()] or None
    augmented, bind = _append_dashboard_filters(
        augmented,
        bind,
        date_from=date_from,
        date_to=date_to,
        bank_name=None,
        bank_names=effective_banks,
        category=None,
        parent_category=pc,
        sub_categories=subs,
        transaction_type=None,
    )
    return augmented, bind


def format_executed_sql(sql: str, bind: dict[str, Any]) -> str:
    """Inline bind parameters into SQL for super-admin debug display only."""
    out = sql
    for key in sorted(bind.keys(), key=lambda k: len(k), reverse=True):
        val = bind[key]
        if isinstance(val, date):
            replacement = f"'{val.isoformat()}'"
        elif isinstance(val, str):
            replacement = "'" + val.replace("'", "''") + "'"
        elif val is None:
            replacement = "NULL"
        else:
            replacement = str(val)
        out = out.replace(f":{key}", replacement)
    return out


def execute_resolved_query(
    resolved_template: str,
    user_id: str,
    db: Session,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    bank: str | None = None,
    banks: list[str] | None = None,
    parent_category: str | None = None,
    sub_categories: list[str] | None = None,
) -> tuple[dict[str, Any], int, str]:
    """Run a resolved widget query and return JSON-serialisable rows.

    Args:
        resolved_template: Translated SQL template.
        user_id:           Tenant id from auth.
        db:                SQLAlchemy session.
        date_from:         Optional date filter.
        date_to:           Optional date filter.
        bank:              Optional single bank filter.
        banks:             Optional multi-bank filter.
        parent_category:   Optional parent category from FilterBar.
        sub_categories:    Optional sub-categories from FilterBar.

    Returns:
        Tuple of result dict, duration_ms, and executed SQL (binds inlined for debug).

    Raises:
        WidgetQueryExecutionError: On validation or DB failure (safe user message).
    """
    started = time.monotonic()
    try:
        sql, bind = prepare_resolved_sql(
            resolved_template,
            user_id,
            date_from=date_from,
            date_to=date_to,
            bank=bank,
            banks=banks,
            parent_category=parent_category,
            sub_categories=sub_categories,
        )
        executed_sql = format_executed_sql(sql, bind)
        result = db.execute(text(sql), bind)
        rows = [dict(row) for row in result.mappings().all()]
        duration_ms = int((time.monotonic() - started) * 1000)
        scalar: float | None = None
        if len(rows) == 1 and len(rows[0]) == 1:
            val = next(iter(rows[0].values()))
            if isinstance(val, (int, float)):
                scalar = float(val)
        return (
            {"rows": rows, "scalar": scalar, "row_count": len(rows)},
            duration_ms,
            executed_sql,
        )
    except ValueError as exc:
        logger.warning("widget query validation failed: %s", exc)
        raise WidgetQueryExecutionError(GENERIC_DB_ERROR, str(exc)) from exc
    except Exception as exc:
        logger.exception("widget query execution failed for user=%s", user_id)
        raise WidgetQueryExecutionError(GENERIC_DB_ERROR, str(exc)) from exc
