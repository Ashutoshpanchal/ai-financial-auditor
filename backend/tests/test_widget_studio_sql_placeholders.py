"""Tests for Widget Studio SQL placeholder stripping and filter injection."""

from __future__ import annotations

from datetime import date

from backend.widget_studio.query_executor import prepare_resolved_sql
from backend.widget_studio.sql_placeholders import strip_llm_embedded_filters


def test_strip_where_user_id_keeps_valid_where_clause() -> None:
    """Removing leading user_id must not produce ``WHERE AND``."""
    sql = (
        "SELECT MAX(debit) AS metric_value FROM transactions "
        "WHERE user_id = '{{user_id}}' AND parent_category = 'Food & Dining'"
    )
    cleaned = strip_llm_embedded_filters(
        sql, date_from=None, date_to=None, bank=None, banks=None
    )
    assert "WHERE  AND" not in cleaned.upper()
    assert "WHERE AND" not in cleaned.upper()
    assert "parent_category" in cleaned


def test_strip_bank_placeholder_when_no_bank_selected() -> None:
    """Unselected bank must not leave ``{{bank}}`` in executed SQL."""
    sql = (
        "SELECT MAX(debit) AS metric_value FROM transactions "
        "WHERE user_id = 'c510d603-05ec-41fb-8041-9e023138d575' "
        "AND parent_category = 'Food & Dining' "
        "AND bank_name = '{{bank}}'"
    )
    cleaned = strip_llm_embedded_filters(
        sql, date_from=None, date_to=None, bank=None, banks=None
    )
    assert "{{bank}}" not in cleaned
    assert "bank_name" not in cleaned.lower() or "bank_name =" not in cleaned


def test_prepare_resolved_sql_swiggy_metric_template() -> None:
    """Full LLM-style template prepares without ``WHERE AND`` syntax errors."""
    sql = (
        "SELECT MAX(debit) AS metric_value FROM transactions "
        "WHERE user_id = '{{user_id}}' AND parent_category = 'Food & Dining' "
        "AND sub_category = 'Swiggy' "
        "AND transaction_date >= '{{date_from}}' AND transaction_date <= '{{date_to}}' "
        "AND bank_name = '{{bank}}'"
    )
    prepared, bind = prepare_resolved_sql(
        sql,
        "user-abc",
        date_from=date(2025, 3, 1),
        date_to=date(2025, 3, 31),
    )
    upper = prepared.upper()
    assert "WHERE  AND" not in upper
    assert "WHERE AND" not in upper
    assert ":_widget_uid" in prepared
    assert "BETWEEN" in upper


def test_prepare_resolved_sql_uses_between_for_date_range() -> None:
    """Dashboard date range uses BETWEEN when both bounds are set."""
    sql = (
        "SELECT SUM(debit) AS value FROM transactions "
        "WHERE user_id = '{{user_id}}' "
        "AND transaction_date >= '{{date_from}}' "
        "AND transaction_date <= '{{date_to}}'"
    )
    prepared, bind = prepare_resolved_sql(
        sql,
        "user-abc",
        date_from=date(2025, 3, 1),
        date_to=date(2025, 3, 31),
    )
    assert "BETWEEN" in prepared
    assert ":_widget_df" in prepared
    assert ":_widget_dt" in prepared
    assert bind["_widget_df"] == date(2025, 3, 1)
    assert bind["_widget_dt"] == date(2025, 3, 31)


def test_prepare_resolved_sql_strips_bank_placeholder_when_bank_selected() -> None:
    """Selecting a bank must not leave ``{{bank}}`` in SQL (server injects bank)."""
    sql = (
        "SELECT MAX(debit) AS metric_value FROM transactions "
        "WHERE user_id = '{{user_id}}' AND parent_category = 'Food & Dining' "
        "AND bank_name = '{{bank}}'"
    )
    prepared, bind = prepare_resolved_sql(sql, "user-abc", banks=["Kotak"])
    assert "{{bank}}" not in prepared
    assert "Kotak" in prepared or bind.get("_widget_bn") == "Kotak"


def test_prepare_resolved_sql_multi_bank_in() -> None:
    """Multiple banks use IN (…) bind params."""
    sql = "SELECT SUM(debit) AS value FROM transactions WHERE user_id = '{{user_id}}'"
    prepared, bind = prepare_resolved_sql(
        sql,
        "user-abc",
        banks=["HDFC", "ICICI"],
    )
    assert "bank_name IN" in prepared
    assert bind["_widget_bn0"] == "HDFC"
    assert bind["_widget_bn1"] == "ICICI"
