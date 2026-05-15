"""Tests for user-safe error sanitization."""

from __future__ import annotations

from backend.services.safe_errors import is_sensitive_error_message, user_safe_detail


class TestSafeErrors:
    """user_safe_detail() must not leak SQL or schema details."""

    def test_sqlalchemy_error_is_generic(self) -> None:
        """ProgrammingError-style messages must be redacted."""
        exc = RuntimeError(
            "run_chat: graph failed — (psycopg2.errors.SyntaxError) syntax error at or near AND"
        )
        assert "psycopg2" not in user_safe_detail(exc)
        assert "syntax error" not in user_safe_detail(exc).lower()

    def test_value_error_with_table_name_is_generic(self) -> None:
        """Validation errors mentioning transactions table must be redacted."""
        exc = ValueError("raw_metric_sql must query FROM transactions")
        detail = user_safe_detail(exc)
        assert "transactions" not in detail.lower()

    def test_benign_value_error_passes_through(self) -> None:
        """Simple validation messages may be shown to the user."""
        exc = ValueError("Message content must not be empty.")
        assert user_safe_detail(exc) == "Message content must not be empty."

    def test_is_sensitive_detects_sql(self) -> None:
        """is_sensitive_error_message flags SQL fragments."""
        assert is_sensitive_error_message("LINE 1: ... FROM transactions WHERE")
