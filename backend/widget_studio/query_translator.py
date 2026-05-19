"""Deterministic abstract SQL → real transactions SQL (server-side only)."""

from __future__ import annotations

import re

from backend.widget_studio.vocabulary import ABSTRACT_TO_REAL

_WORD = re.compile(r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b")

_DML_DDL = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|create|grant|revoke)\b",
    re.IGNORECASE,
)


def translate_abstract_sql(abstract_sql: str) -> str:
    """Replace abstract vocabulary tokens with real ``transactions`` column names.

    Args:
        abstract_sql: SQL using Widget Studio abstract identifiers only.

    Returns:
        SQL referencing the real ``transactions`` table and columns.
    """

    def repl(match: re.Match[str]) -> str:
        token = match.group(1)
        lower = token.lower()
        for abstract, real in ABSTRACT_TO_REAL.items():
            if lower == abstract.lower():
                return real
        return token

    return _WORD.sub(repl, abstract_sql.strip())


def validate_resolved_sql(sql: str) -> None:
    """Ensure translated SQL is safe to run in the widget sandbox.

    Args:
        sql: Real SQL after ``translate_abstract_sql``.

    Raises:
        ValueError: If the statement fails sandbox rules.
    """
    stripped = sql.strip()
    if not stripped:
        raise ValueError("Query must not be empty.")
    lowered = stripped.lower()
    if not lowered.startswith("select"):
        raise ValueError("Only SELECT statements are allowed.")
    if _DML_DDL.search(stripped):
        raise ValueError("DDL/DML statements are not allowed.")
    if ";" in stripped.rstrip().rstrip(";"):
        raise ValueError("Multiple statements are not allowed.")
    if not re.search(r"\bfrom\s+transactions\b", stripped, re.IGNORECASE):
        raise ValueError("Query must read from transactions only.")
    if not re.search(r"\buser_id\b", stripped, re.IGNORECASE):
        raise ValueError("Query must scope by user_id.")
