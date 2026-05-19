"""Tests for Widget Studio query translation, validation, and rate limits."""

from __future__ import annotations

import pytest

from backend.services.widget_studio_rate_limit import (
    WidgetStudioRateLimited,
    check_widget_studio_message_rate_limit,
    reset_widget_studio_rate_limits,
)
from backend.widget_studio.query_executor import prepare_resolved_sql
from backend.widget_studio.query_translator import (
    translate_abstract_sql,
    validate_resolved_sql,
)


def test_translate_abstract_sql_maps_vocabulary() -> None:
    """Abstract identifiers become real transactions columns."""
    abstract = (
        "SELECT SUM(outflow) AS value FROM source_table "
        "WHERE user_scope = '{{user_id}}' "
        "AND parent_label = 'Food' "
        "AND record_date >= '{{date_from}}'"
    )
    real = translate_abstract_sql(abstract)
    assert "transactions" in real
    assert "debit" in real
    assert "user_id" in real
    assert "parent_category" in real
    assert "transaction_date" in real
    assert "source_table" not in real


def test_validate_resolved_sql_rejects_dml() -> None:
    """DELETE and other DML are rejected."""
    with pytest.raises(ValueError, match="SELECT"):
        validate_resolved_sql("DELETE FROM transactions")


def test_prepare_resolved_sql_injects_user_scope() -> None:
    """Prepared SQL uses bind params for user scope."""
    sql = "SELECT SUM(debit) AS value FROM transactions WHERE user_id = '{{user_id}}'"
    prepared, bind = prepare_resolved_sql(sql, "user-abc")
    assert ":_widget_uid" in prepared
    assert bind["_widget_uid"] == "user-abc"


def test_message_rate_limit_enforced() -> None:
    """More than max requests per minute raises."""
    reset_widget_studio_rate_limits()
    for _ in range(3):
        check_widget_studio_message_rate_limit("u1", max_per_minute=3)
    with pytest.raises(WidgetStudioRateLimited):
        check_widget_studio_message_rate_limit("u1", max_per_minute=3)
    reset_widget_studio_rate_limits()
