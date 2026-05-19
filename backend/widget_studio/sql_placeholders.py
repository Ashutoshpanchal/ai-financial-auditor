"""Strip LLM-embedded filter literals before server-side bind injection."""

from __future__ import annotations

import re
from datetime import date

# Optional dashboard placeholders (with or without ``transactions.`` prefix).
_EMBEDDED_DATE_FROM = re.compile(
    r"\s+AND\s+(?:transactions\.)?transaction_date\s*>=\s*'\{\{date_from\}\}'",
    re.IGNORECASE,
)
_EMBEDDED_DATE_TO = re.compile(
    r"\s+AND\s+(?:transactions\.)?transaction_date\s*<=\s*'\{\{date_to\}\}'",
    re.IGNORECASE,
)
_EMBEDDED_DATE_BETWEEN = re.compile(
    r"\s+AND\s+(?:transactions\.)?transaction_date\s+BETWEEN\s*"
    r"'\{\{date_from\}\}'\s+AND\s+'\{\{date_to\}\}'",
    re.IGNORECASE,
)
_EMBEDDED_BANK = re.compile(
    r"\s+AND\s+(?:transactions\.)?bank_name\s*=\s*'\{\{(?:bank|bank_name)\}\}'",
    re.IGNORECASE,
)
# LLM sometimes inlines user_id; scope is always injected server-side.
_EMBEDDED_USER = re.compile(
    r"\s+AND\s+(?:transactions\.)?user_id\s*=\s*'[^']*'",
    re.IGNORECASE,
)
_WHERE_USER_AND = re.compile(
    r"\bWHERE\s+(?:transactions\.)?user_id\s*=\s*'[^']*'\s+AND\s+",
    re.IGNORECASE,
)
_WHERE_USER_ONLY = re.compile(
    r"\bWHERE\s+(?:transactions\.)?user_id\s*=\s*'[^']*'",
    re.IGNORECASE,
)
_WHERE_EMPTY_AND = re.compile(r"\bWHERE\s+AND\s+", re.IGNORECASE)


def strip_llm_embedded_filters(
    sql: str,
    *,
    date_from: date | None,
    date_to: date | None,
    bank: str | None,
    banks: list[str] | None = None,
) -> str:
    """Remove optional placeholder clauses when the dashboard filter is not set.

    Args:
        sql: Resolved SQL after vocabulary translation.
        date_from: Applied start date, if any.
        date_to: Applied end date, if any.
        bank: Legacy single bank filter.
        banks: Optional list of selected banks.

    Returns:
        SQL with unused placeholder predicates removed.
    """
    result = sql
    if date_from is None:
        result = _EMBEDDED_DATE_FROM.sub("", result)
    if date_to is None:
        result = _EMBEDDED_DATE_TO.sub("", result)
    if date_from is None or date_to is None:
        result = _EMBEDDED_DATE_BETWEEN.sub("", result)
    # Always strip LLM bank placeholders — real bank filters are injected via
    # ``_append_dashboard_filters`` (bind params), not template substitution.
    result = _EMBEDDED_BANK.sub("", result)
    # Remove duplicate / LLM-inlined user scope (re-injected as bind param).
    result = _EMBEDDED_USER.sub("", result)
    result = _WHERE_USER_AND.sub("WHERE ", result)
    result = _WHERE_USER_ONLY.sub("", result)
    result = _WHERE_EMPTY_AND.sub("WHERE ", result)
    return result
