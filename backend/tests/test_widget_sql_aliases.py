"""Tests for LLM dummy SQL alias translation."""

from __future__ import annotations

from backend.services.widget_metric_raw_sql import validate_raw_metric_sql
from backend.services.widget_sql_aliases import (
    LLM_TABLE_NAME,
    abstract_sql_for_display,
    translate_llm_sql_to_real,
)


class TestWidgetSqlAliases:
    """translate_llm_sql_to_real maps dummy identifiers to transactions schema."""

    def test_peak_day_sql_translates_and_validates(self) -> None:
        """Peak-day pattern using LLM table/columns passes sandbox validation."""
        llm_sql = (
            "SELECT COALESCE(MAX(daily_total), 0) FROM ("
            f"SELECT DATE(txn_date) AS d, SUM(outflow) AS daily_total "
            f"FROM {LLM_TABLE_NAME} WHERE outflow > 0 "
            "GROUP BY DATE(txn_date)) daily"
        )
        real = translate_llm_sql_to_real(llm_sql)
        assert "from transactions" in real.lower()
        assert "transaction_date" in real
        assert "debit" in real
        assert LLM_TABLE_NAME not in real
        validate_raw_metric_sql(real)

    def test_abstract_sql_hides_real_table(self) -> None:
        """Display helper rewrites real names to abstract vocabulary."""
        real = "SELECT SUM(debit) FROM transactions WHERE transaction_date >= :d"
        shown = abstract_sql_for_display(real)
        assert "your_transactions" in shown
        assert "outflow" in shown
        assert "txn_date" in shown
        assert "from transactions" not in shown.lower()
