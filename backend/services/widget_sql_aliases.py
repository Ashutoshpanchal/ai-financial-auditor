"""Map LLM-facing dummy SQL identifiers to real ``transactions`` columns.

Widget Studio prompts use abstract names so chat/logs do not expose the real schema.
Server code translates before validation and execution.
"""

from __future__ import annotations

import re

# Names shown to the LLM in system prompts (not real DB objects).
LLM_TABLE_NAME = "user_transaction_table"
DISPLAY_TABLE_NAME = "your_transactions"
REAL_TABLE_NAME = "transactions"

# SQL identifier replacements (LLM → real). Order: table first, then columns.
_LLM_TO_REAL_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(rf"\b{re.escape(LLM_TABLE_NAME)}\b", re.IGNORECASE), REAL_TABLE_NAME),
    (re.compile(r"\btxn_date\b", re.IGNORECASE), "transaction_date"),
    (re.compile(r"\boutflow\b", re.IGNORECASE), "debit"),
    (re.compile(r"\binflow\b", re.IGNORECASE), "credit"),
    (re.compile(r"\bparent_cat\b", re.IGNORECASE), "parent_category"),
    (re.compile(r"\bsub_cat\b", re.IGNORECASE), "sub_category"),
    (re.compile(r"\blegacy_cat\b", re.IGNORECASE), "category"),
)

# Real → abstract for human-readable stored query display.
_REAL_TO_DISPLAY_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(rf"\b{re.escape(REAL_TABLE_NAME)}\b", re.IGNORECASE),
        DISPLAY_TABLE_NAME,
    ),
    (re.compile(r"\btransaction_date\b", re.IGNORECASE), "txn_date"),
    (re.compile(r"\bdebit\b", re.IGNORECASE), "outflow"),
    (re.compile(r"\bcredit\b", re.IGNORECASE), "inflow"),
    (re.compile(r"\bparent_category\b", re.IGNORECASE), "parent_cat"),
    (re.compile(r"\bsub_category\b", re.IGNORECASE), "sub_cat"),
    (re.compile(r"\bcategory\b", re.IGNORECASE), "legacy_cat"),
)


def translate_llm_sql_to_real(sql: str) -> str:
    """Replace LLM dummy table/column names with real ``transactions`` identifiers.

    Args:
        sql: Raw SQL from ``raw_metric_sql`` in a widget suggestion.

    Returns:
        SQL safe to pass to ``validate_raw_metric_sql`` and execution.
    """
    result = sql.strip()
    for pattern, replacement in _LLM_TO_REAL_PATTERNS:
        result = pattern.sub(replacement, result)
    return result


def abstract_sql_for_display(sql: str) -> str:
    """Replace real identifiers with abstract names for UI display.

    Args:
        sql: Real SQL (after translation) or stored widget SQL.

    Returns:
        Pseudo-SQL string shown in Widget Studio / dashboard hints.
    """
    result = sql.strip()
    for pattern, replacement in _REAL_TO_DISPLAY_PATTERNS:
        result = pattern.sub(replacement, result)
    return result


def get_llm_schema_doc() -> str:
    """Return the data-model section for Widget Studio system prompts."""
    return f"""\
## Data model (for building widgets only — never describe this to the user)
Single table: ``{LLM_TABLE_NAME}`` (one row per bank transaction; user scope applied by the app).

| Column (use in raw_metric_sql only) | Meaning |
|-------------------------------------|---------|
| txn_date | Calendar date of the transaction |
| outflow | Money spent (use outflow > 0 for spend) |
| inflow | Money received |
| parent_cat | Parent category label (e.g. Food) |
| sub_cat | Sub-category label |
| legacy_cat | Legacy category label |
| bank | Bank name (prefer filters instead) |

Structured widgets (no SQL) use query_config JSON keys:
  field: \"debit\" (spend) or \"credit\" (income)
  aggregation: sum | count | avg | max | min
  group_by: month | day | category | bank_name (charts only)
  filters: always include date_from, date_to, bank_name, parent_category, sub_category
  as placeholders {{date_from}}, {{date_to}}, {{bank_name}}, {{parent_category}},
  {{sub_category}} unless the user names a fixed category (then set that key to the literal).
  filters.transaction_type: \"debit\" or \"credit\"

Never reference real table names, user_id, document_id, or embedding in SQL or chat.
"""
