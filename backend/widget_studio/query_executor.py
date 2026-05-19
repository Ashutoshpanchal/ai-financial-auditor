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
from backend.widget_studio.vocabulary import GENERIC_DB_ERROR, PLACEHOLDER_USER_ID

logger = logging.getLogger(__name__)

_EMBEDDED_USER = re.compile(
    r"\buser_id\s*=\s*'\{\{user_id\}\}'",
    re.IGNORECASE,
)
_EMBEDDED_DATE_FROM = re.compile(
    r"\s+AND\s+transactions\.transaction_date\s*>=\s*'\{\{date_from\}\}'",
    re.IGNORECASE,
)
_EMBEDDED_DATE_TO = re.compile(
    r"\s+AND\s+transactions\.transaction_date\s*<=\s*'\{\{date_to\}\}'",
    re.IGNORECASE,
)
_EMBEDDED_BANK = re.compile(
    r"\s+AND\s+transactions\.bank_name\s*=\s*'\{\{bank\}\}'",
    re.IGNORECASE,
)


class WidgetQueryExecutionError(Exception):
    """Raised when query execution fails; carries a safe user message."""

    def __init__(self, user_message: str, internal: str | None = None) -> None:
        super().__init__(user_message)
        self.user_message = user_message
        self.internal = internal


def _strip_optional_placeholders(
    sql: str,
    *,
    date_from: date | None,
    date_to: date | None,
    bank: str | None,
) -> str:
    """Remove optional filter clauses when dashboard filters are not applied."""
    result = sql
    if date_from is None:
        result = _EMBEDDED_DATE_FROM.sub("", result)
    if date_to is None:
        result = _EMBEDDED_DATE_TO.sub("", result)
    if bank is None:
        result = _EMBEDDED_BANK.sub("", result)
    return result


def prepare_resolved_sql(
    resolved_template: str,
    user_id: str,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    bank: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """Build parameterised SQL and bind dict from a resolved query template.

    Args:
        resolved_template: SQL with real or abstract identifiers and placeholders.
        user_id:           Authenticated user id (never from client).
        date_from:         Optional inclusive start date.
        date_to:           Optional inclusive end date.
        bank:              Optional bank_name filter.

    Returns:
        Tuple of executable SQL and bind parameters.
    """
    sql = translate_abstract_sql(resolved_template)
    validate_resolved_sql(sql)
    sql = _strip_optional_placeholders(
        sql, date_from=date_from, date_to=date_to, bank=bank
    )
    sql = strip_embedded_sql_placeholders(sql)
    sql = _EMBEDDED_USER.sub("transactions.user_id = :_widget_uid", sql)
    if PLACEHOLDER_USER_ID in sql:
        sql = sql.replace(f"'{PLACEHOLDER_USER_ID}'", ":_widget_uid")
        sql = sql.replace(PLACEHOLDER_USER_ID, ":_widget_uid")

    validate_raw_metric_sql(sql)
    augmented, bind = inject_user_scope(sql, user_id)
    augmented, bind = _append_dashboard_filters(
        augmented,
        bind,
        date_from=date_from,
        date_to=date_to,
        bank_name=bank,
        category=None,
        parent_category=None,
        sub_categories=None,
        transaction_type=None,
    )
    return augmented, bind


def execute_resolved_query(
    resolved_template: str,
    user_id: str,
    db: Session,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    bank: str | None = None,
) -> tuple[dict[str, Any], int]:
    """Run a resolved widget query and return JSON-serialisable rows.

    Args:
        resolved_template: Translated SQL template.
        user_id:           Tenant id from auth.
        db:                SQLAlchemy session.
        date_from:         Optional date filter.
        date_to:           Optional date filter.
        bank:              Optional bank filter.

    Returns:
        Tuple of result dict and duration_ms.

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
        )
        result = db.execute(text(sql), bind)
        rows = [dict(row) for row in result.mappings().all()]
        duration_ms = int((time.monotonic() - started) * 1000)
        scalar: float | None = None
        if len(rows) == 1 and len(rows[0]) == 1:
            val = next(iter(rows[0].values()))
            if isinstance(val, (int, float)):
                scalar = float(val)
        return {"rows": rows, "scalar": scalar, "row_count": len(rows)}, duration_ms
    except ValueError as exc:
        logger.warning("widget query validation failed: %s", exc)
        raise WidgetQueryExecutionError(GENERIC_DB_ERROR, str(exc)) from exc
    except Exception as exc:
        logger.exception("widget query execution failed for user=%s", user_id)
        raise WidgetQueryExecutionError(GENERIC_DB_ERROR, str(exc)) from exc
