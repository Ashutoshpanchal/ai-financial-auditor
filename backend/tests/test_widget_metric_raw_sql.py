"""Tests for backend.services.widget_metric_raw_sql — user SQL validation and execution."""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

import pytest

from backend.services.widget_metric_raw_sql import (
    execute_raw_metric_sql,
    inject_user_scope,
    strip_embedded_sql_placeholders,
    validate_raw_metric_sql,
)


class TestValidateRawMetricSql:
    """validate_raw_metric_sql() rejects unsafe or invalid SQL."""

    def test_empty_sql_raises_valueerror(self) -> None:
        """Empty SQL string must raise ValueError."""
        with pytest.raises(ValueError, match="must not be empty"):
            validate_raw_metric_sql("")

    def test_whitespace_only_sql_raises_valueerror(self) -> None:
        """Whitespace-only SQL must raise ValueError."""
        with pytest.raises(ValueError, match="must not be empty"):
            validate_raw_metric_sql("   \n  \t  ")

    def test_sql_exceeding_max_length_raises_valueerror(self) -> None:
        """SQL exceeding 4096 characters must raise ValueError."""
        long_sql = "SELECT * FROM transactions WHERE " + "a" * 4100
        with pytest.raises(ValueError, match="exceeds 4096 characters"):
            validate_raw_metric_sql(long_sql)

    def test_non_select_statement_raises_valueerror(self) -> None:
        """Non-SELECT statement must raise ValueError."""
        with pytest.raises(ValueError, match="must be a single SELECT"):
            validate_raw_metric_sql("INSERT INTO transactions VALUES (1, 2, 3)")

    def test_update_statement_raises_valueerror(self) -> None:
        """UPDATE statement must raise ValueError."""
        with pytest.raises(ValueError, match="must be a single SELECT"):
            validate_raw_metric_sql("UPDATE transactions SET debit = 0")

    def test_delete_statement_raises_valueerror(self) -> None:
        """DELETE statement must raise ValueError."""
        with pytest.raises(ValueError, match="must be a single SELECT"):
            validate_raw_metric_sql("DELETE FROM transactions")

    def test_drop_statement_raises_valueerror(self) -> None:
        """DROP statement must raise ValueError (disallowed keyword)."""
        with pytest.raises(ValueError, match="Disallowed keyword"):
            validate_raw_metric_sql(
                "SELECT * FROM transactions; DROP TABLE transactions"
            )

    def test_union_statement_raises_valueerror(self) -> None:
        """UNION statement must raise ValueError (disallowed keyword)."""
        with pytest.raises(ValueError, match="Disallowed keyword"):
            validate_raw_metric_sql(
                "SELECT debit FROM transactions UNION SELECT credit FROM other"
            )

    def test_join_in_sql_raises_valueerror(self) -> None:
        """JOIN clause must raise ValueError (not allowed)."""
        with pytest.raises(ValueError, match="JOIN is not allowed"):
            validate_raw_metric_sql(
                "SELECT t.debit FROM transactions t JOIN users u ON t.user_id = u.id"
            )

    def test_sql_comment_with_dashes_raises_valueerror(self) -> None:
        """SQL comments (--) must raise ValueError."""
        with pytest.raises(ValueError, match="SQL comments are not allowed"):
            validate_raw_metric_sql(
                "SELECT debit FROM transactions -- where user_id = '123'"
            )

    def test_sql_comment_with_slash_raises_valueerror(self) -> None:
        """SQL comments (/* */) must raise ValueError."""
        with pytest.raises(ValueError, match="SQL comments are not allowed"):
            validate_raw_metric_sql("SELECT debit /* important */ FROM transactions")

    def test_multiple_statements_raises_valueerror(self) -> None:
        """Multiple SQL statements separated by ; must raise ValueError."""
        with pytest.raises(ValueError, match="Multiple SQL statements"):
            validate_raw_metric_sql(
                "SELECT debit FROM transactions; SELECT credit FROM transactions"
            )

    def test_missing_from_transactions_raises_valueerror(self) -> None:
        """SELECT without FROM transactions must raise ValueError."""
        with pytest.raises(ValueError, match="must query the transactions table"):
            validate_raw_metric_sql("SELECT SUM(credit) FROM orders")

    def test_grant_statement_raises_valueerror(self) -> None:
        """GRANT statement must raise ValueError (disallowed keyword)."""
        with pytest.raises(ValueError, match="Disallowed keyword"):
            validate_raw_metric_sql(
                "SELECT * FROM transactions; GRANT ALL ON transactions TO admin"
            )

    def test_pg_sleep_raises_valueerror(self) -> None:
        """pg_sleep function must raise ValueError (disallowed keyword)."""
        with pytest.raises(ValueError, match="Disallowed keyword"):
            validate_raw_metric_sql(
                "SELECT SUM(debit) FROM transactions WHERE pg_sleep(5) IS NULL"
            )

    def test_information_schema_raises_valueerror(self) -> None:
        """information_schema query must raise ValueError."""
        with pytest.raises(ValueError, match="Disallowed keyword"):
            validate_raw_metric_sql("SELECT * FROM information_schema.columns")

    def test_valid_simple_select_passes(self) -> None:
        """Simple SELECT from transactions must pass validation."""
        validate_raw_metric_sql("SELECT SUM(debit) FROM transactions")

    def test_valid_select_with_where_passes(self) -> None:
        """SELECT with WHERE clause must pass validation."""
        validate_raw_metric_sql(
            "SELECT SUM(credit) FROM transactions WHERE debit > 100"
        )

    def test_valid_select_with_aggregation_passes(self) -> None:
        """SELECT with aggregation functions must pass validation."""
        validate_raw_metric_sql(
            "SELECT COUNT(*), AVG(debit), MAX(credit) FROM transactions"
        )

    def test_valid_select_with_group_by_passes(self) -> None:
        """SELECT with GROUP BY must pass validation."""
        validate_raw_metric_sql(
            "SELECT category, SUM(debit) FROM transactions GROUP BY category"
        )

    def test_valid_select_with_order_by_passes(self) -> None:
        """SELECT with ORDER BY must pass validation."""
        validate_raw_metric_sql(
            "SELECT debit FROM transactions ORDER BY transaction_date DESC"
        )

    def test_valid_select_with_limit_passes(self) -> None:
        """SELECT with LIMIT must pass validation."""
        validate_raw_metric_sql("SELECT debit FROM transactions LIMIT 100")

    def test_valid_select_with_trailing_semicolon_passes(self) -> None:
        """SELECT with trailing semicolon must pass validation."""
        validate_raw_metric_sql("SELECT SUM(debit) FROM transactions;")

    def test_lowercase_select_passes(self) -> None:
        """Lowercase 'select' keyword must pass validation."""
        validate_raw_metric_sql("select sum(debit) from transactions")

    def test_mixed_case_select_passes(self) -> None:
        """Mixed case SELECT must pass validation."""
        validate_raw_metric_sql("SeLeCt SuM(debit) FrOm transactions")


class TestInjectUserScope:
    """inject_user_scope() appends user_id filter before ORDER BY / LIMIT."""

    def test_simple_select_adds_where_clause(self) -> None:
        """Simple SELECT without WHERE must add WHERE clause."""
        sql, params = inject_user_scope(
            "SELECT SUM(debit) FROM transactions", "user-123"
        )
        assert "transactions.user_id = :_widget_uid" in sql
        assert params["_widget_uid"] == "user-123"
        assert sql.startswith("SELECT SUM(debit) FROM transactions WHERE")

    def test_select_with_where_adds_and_clause(self) -> None:
        """SELECT with existing WHERE must add AND clause."""
        sql, params = inject_user_scope(
            "SELECT SUM(debit) FROM transactions WHERE debit > 100", "user-456"
        )
        assert "AND transactions.user_id = :_widget_uid" in sql
        assert params["_widget_uid"] == "user-456"

    def test_select_with_order_by_injects_before_order(self) -> None:
        """WHERE/AND clause must be injected before ORDER BY."""
        sql, params = inject_user_scope(
            "SELECT debit FROM transactions WHERE debit > 0 ORDER BY transaction_date DESC",
            "user-789",
        )
        # Check that user_id clause comes before ORDER BY
        user_idx = sql.find("transactions.user_id = :_widget_uid")
        order_idx = sql.find("ORDER BY")
        assert user_idx < order_idx
        assert params["_widget_uid"] == "user-789"

    def test_select_with_limit_injects_before_limit(self) -> None:
        """WHERE/AND clause must be injected before LIMIT."""
        sql, params = inject_user_scope(
            "SELECT debit FROM transactions LIMIT 100", "user-abc"
        )
        user_idx = sql.find("transactions.user_id = :_widget_uid")
        limit_idx = sql.find("LIMIT")
        assert user_idx < limit_idx
        assert params["_widget_uid"] == "user-abc"

    def test_preserves_trailing_clause(self) -> None:
        """ORDER BY / LIMIT / OFFSET clauses must be preserved in output."""
        original = "SELECT debit FROM transactions WHERE debit > 0 ORDER BY transaction_date LIMIT 10"
        sql, _ = inject_user_scope(original, "user-xyz")
        assert "ORDER BY transaction_date" in sql
        assert "LIMIT 10" in sql

    def test_bind_parameter_key_is_widget_uid(self) -> None:
        """Bind parameter must use key '_widget_uid'."""
        _, params = inject_user_scope("SELECT * FROM transactions", "user-test")
        assert "_widget_uid" in params
        assert params["_widget_uid"] == "user-test"

    def test_case_insensitive_where_detection(self) -> None:
        """WHERE keyword detection must be case-insensitive."""
        sql_lower, _ = inject_user_scope(
            "SELECT * FROM transactions where debit > 0", "user-1"
        )
        sql_upper, _ = inject_user_scope(
            "SELECT * FROM transactions WHERE debit > 0", "user-1"
        )
        # Both should use AND (WHERE clause detected)
        assert " AND transactions.user_id" in sql_lower
        assert " AND transactions.user_id" in sql_upper

    def test_multiple_where_conditions(self) -> None:
        """Multiple WHERE conditions must have AND appended correctly."""
        sql, _ = inject_user_scope(
            "SELECT * FROM transactions WHERE debit > 0 AND credit < 1000", "user-test"
        )
        # Should add AND before ORDER BY / LIMIT if present, or at end
        assert "AND transactions.user_id = :_widget_uid" in sql

    def test_subquery_injects_inside_inner_from_transactions(self) -> None:
        """Peak-day subquery must not append user_id after the subquery alias."""
        inner = (
            "SELECT COALESCE(MAX(daily_total), 0) FROM ("
            "SELECT DATE(transaction_date) AS d, SUM(debit) AS daily_total "
            "FROM transactions WHERE debit > 0 "
            "GROUP BY DATE(transaction_date)) daily"
        )
        sql, params = inject_user_scope(inner, "user-peak")
        assert ") daily AND transactions.user_id" not in sql.replace(" ", "")
        user_idx = sql.find("transactions.user_id = :_widget_uid")
        group_idx = sql.upper().find("GROUP BY")
        assert user_idx != -1 and user_idx < group_idx
        assert params["_widget_uid"] == "user-peak"

    def test_strips_embedded_date_placeholders(self) -> None:
        """Date placeholders embedded in SQL are removed before injection."""
        raw = (
            "SELECT SUM(debit) FROM transactions WHERE debit > 0 "
            "AND transaction_date >= '{{date_from}}' "
            "AND transaction_date <= '{{date_to}}'"
        )
        cleaned = strip_embedded_sql_placeholders(raw)
        assert "{{date_from}}" not in cleaned
        assert "{{date_to}}" not in cleaned


class TestExecuteRawMetricSql:
    """execute_raw_metric_sql() runs validated SQL and returns a float."""

    def _make_db(self, scalar_result=None):
        """Return a mock SQLAlchemy session."""
        db = MagicMock()
        execute_result = MagicMock()
        execute_result.scalar.return_value = scalar_result
        db.execute.return_value = execute_result
        return db

    def test_returns_float(self) -> None:
        """Result must always be a float, even for integer results."""
        db = self._make_db(scalar_result=42)
        result = execute_raw_metric_sql(
            "SELECT COUNT(*) FROM transactions", "user-123", db
        )
        assert isinstance(result, float)
        assert result == 42.0

    def test_returns_zero_when_sql_result_is_none(self) -> None:
        """When SQL returns NULL, result must be 0.0."""
        db = self._make_db(scalar_result=None)
        result = execute_raw_metric_sql(
            "SELECT SUM(debit) FROM transactions WHERE debit < 0", "user-123", db
        )
        assert result == 0.0

    def test_injects_user_scope(self) -> None:
        """User ID must be injected into the SQL."""
        db = MagicMock()
        execute_result = MagicMock()
        execute_result.scalar.return_value = 100.0
        db.execute.return_value = execute_result

        execute_raw_metric_sql("SELECT SUM(debit) FROM transactions", "user-abc", db)

        # Check that execute was called
        assert db.execute.called
        # First argument to execute should be a text object with injected SQL
        call_args = db.execute.call_args
        passed_sql = str(call_args[0][0])
        assert "transactions.user_id = :_widget_uid" in passed_sql

    def test_injects_date_from_filter(self) -> None:
        """date_from parameter must add transaction_date >= filter."""
        db = MagicMock()
        execute_result = MagicMock()
        execute_result.scalar.return_value = 50.0
        db.execute.return_value = execute_result

        execute_raw_metric_sql(
            "SELECT SUM(debit) FROM transactions",
            "user-test",
            db,
            date_from=date(2024, 1, 1),
        )

        # Check that date filter was injected
        call_args = db.execute.call_args
        bind_params = call_args[0][1]
        assert "_widget_df" in bind_params
        assert bind_params["_widget_df"] == date(2024, 1, 1)

    def test_injects_date_to_filter(self) -> None:
        """date_to parameter must add transaction_date <= filter."""
        db = self._make_db(scalar_result=75.0)

        execute_raw_metric_sql(
            "SELECT SUM(credit) FROM transactions",
            "user-test",
            db,
            date_to=date(2024, 12, 31),
        )

        call_args = db.execute.call_args
        bind_params = call_args[0][1]
        assert "_widget_dt" in bind_params
        assert bind_params["_widget_dt"] == date(2024, 12, 31)

    def test_injects_bank_name_filter(self) -> None:
        """bank_name parameter must add bank filter."""
        db = self._make_db(scalar_result=200.0)

        execute_raw_metric_sql(
            "SELECT SUM(debit) FROM transactions", "user-test", db, bank_name="Chase"
        )

        call_args = db.execute.call_args
        bind_params = call_args[0][1]
        assert "_widget_bn" in bind_params
        assert bind_params["_widget_bn"] == "Chase"

    def test_injects_category_filter(self) -> None:
        """category parameter must add category filter."""
        db = self._make_db(scalar_result=150.0)

        execute_raw_metric_sql(
            "SELECT SUM(debit) FROM transactions", "user-test", db, category="Groceries"
        )

        call_args = db.execute.call_args
        bind_params = call_args[0][1]
        assert "_widget_cat" in bind_params
        assert bind_params["_widget_cat"] == "Groceries"

    def test_injects_credit_transaction_type_filter(self) -> None:
        """transaction_type='credit' must add credit > 0 filter."""
        db = self._make_db(scalar_result=500.0)

        execute_raw_metric_sql(
            "SELECT SUM(credit) FROM transactions",
            "user-test",
            db,
            transaction_type="credit",
        )

        call_args = db.execute.call_args
        passed_sql = str(call_args[0][0])
        # Should contain the credit > 0 filter
        assert "credit > 0" in passed_sql

    def test_injects_debit_transaction_type_filter(self) -> None:
        """transaction_type='debit' must add debit > 0 filter."""
        db = self._make_db(scalar_result=300.0)

        execute_raw_metric_sql(
            "SELECT SUM(debit) FROM transactions",
            "user-test",
            db,
            transaction_type="debit",
        )

        call_args = db.execute.call_args
        passed_sql = str(call_args[0][0])
        assert "debit > 0" in passed_sql

    def test_combines_multiple_filters(self) -> None:
        """Multiple filters must all be injected as AND clauses."""
        db = self._make_db(scalar_result=123.45)

        execute_raw_metric_sql(
            "SELECT SUM(debit) FROM transactions WHERE debit > 0",
            "user-test",
            db,
            date_from=date(2024, 1, 1),
            date_to=date(2024, 6, 30),
            bank_name="Chase",
            category="Groceries",
            transaction_type="debit",
        )

        call_args = db.execute.call_args
        bind_params = call_args[0][1]

        # All filters should be present
        assert bind_params.get("_widget_uid") == "user-test"
        assert bind_params.get("_widget_df") == date(2024, 1, 1)
        assert bind_params.get("_widget_dt") == date(2024, 6, 30)
        assert bind_params.get("_widget_bn") == "Chase"
        assert bind_params.get("_widget_cat") == "Groceries"

    def test_no_filters_when_none_provided(self) -> None:
        """When no optional filters provided, only user_id scope should be injected."""
        db = self._make_db(scalar_result=50.0)

        execute_raw_metric_sql("SELECT SUM(debit) FROM transactions", "user-xyz", db)

        call_args = db.execute.call_args
        bind_params = call_args[0][1]

        # Only user_id should be in params
        assert "_widget_uid" in bind_params
        assert len(bind_params) == 1

    def test_decimal_result_preserved(self) -> None:
        """Decimal/float results must be converted to float correctly."""
        db = self._make_db(scalar_result=123.456789)
        result = execute_raw_metric_sql(
            "SELECT SUM(debit) FROM transactions", "user-test", db
        )
        assert result == 123.456789
        assert isinstance(result, float)

    def test_peak_day_subquery_executes_without_syntax_error(self) -> None:
        """Subquery peak-day SQL injects scope before GROUP BY, not after alias."""
        db = self._make_db(scalar_result=1000.0)
        sql = (
            "SELECT COALESCE(MAX(daily_total), 0) FROM ("
            "SELECT DATE(transaction_date) AS d, SUM(debit) AS daily_total "
            "FROM transactions WHERE debit > 0 "
            "AND transaction_date >= '{{date_from}}' "
            "AND transaction_date <= '{{date_to}}' "
            "GROUP BY DATE(transaction_date)) daily"
        )
        execute_raw_metric_sql(
            sql,
            "user-peak",
            db,
            date_from=date(2026, 3, 1),
            date_to=date(2026, 3, 31),
            transaction_type="debit",
        )
        passed_sql = str(db.execute.call_args[0][0])
        assert ") daily AND transactions.user_id" not in passed_sql.replace(" ", "")
        assert "transactions.user_id = :_widget_uid" in passed_sql
        assert "{{date_from}}" not in passed_sql
        bind_params = db.execute.call_args[0][1]
        assert bind_params["_widget_df"] == date(2026, 3, 1)
        assert bind_params["_widget_dt"] == date(2026, 3, 31)
