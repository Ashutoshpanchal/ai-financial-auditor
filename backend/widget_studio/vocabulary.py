"""Abstract SQL vocabulary for Widget Studio (never exposed to end users in API)."""

from __future__ import annotations

# Abstract table/column identifiers used in LLM-generated abstract_query.
ABSTRACT_TABLE = "source_table"
ABSTRACT_USER_SCOPE = "user_scope"
ABSTRACT_RECORD_DATE = "record_date"
ABSTRACT_SOURCE_BANK = "source_bank"
ABSTRACT_OUTFLOW = "outflow"
ABSTRACT_INFLOW = "inflow"
ABSTRACT_PARENT_LABEL = "parent_label"
ABSTRACT_SUB_LABEL = "sub_label"
ABSTRACT_LEGACY_LABEL = "legacy_label"

# Deterministic mapping abstract identifier -> real DB identifier (transactions only).
ABSTRACT_TO_REAL: dict[str, str] = {
    ABSTRACT_TABLE: "transactions",
    ABSTRACT_USER_SCOPE: "user_id",
    ABSTRACT_RECORD_DATE: "transaction_date",
    ABSTRACT_SOURCE_BANK: "bank_name",
    ABSTRACT_OUTFLOW: "debit",
    ABSTRACT_INFLOW: "credit",
    ABSTRACT_PARENT_LABEL: "parent_category",
    ABSTRACT_SUB_LABEL: "sub_category",
    ABSTRACT_LEGACY_LABEL: "category",
}

PLACEHOLDER_USER_ID = "{{user_id}}"
PLACEHOLDER_DATE_FROM = "{{date_from}}"
PLACEHOLDER_DATE_TO = "{{date_to}}"
PLACEHOLDER_BANK = "{{bank}}"

OFF_TOPIC_REPLY = "I can only help you build widgets based on your transaction data."
GENERIC_DB_ERROR = "Something went wrong while fetching your data. Please try again."
CLARIFICATION_LOOP_ERROR = (
    "I couldn't fully understand your request. Could you try rephrasing it?"
)
WIDGET_BROKEN_ERROR = "WIDGET_BROKEN"
WIDGET_BROKEN_MESSAGE = (
    "The category used in this widget no longer exists. "
    "Please delete it and create a new one."
)
# Legacy alias
CATEGORY_NOT_FOUND_MESSAGE = WIDGET_BROKEN_MESSAGE
NETWORK_TIMEOUT_MESSAGE = "This is taking longer than expected. Please try again."
