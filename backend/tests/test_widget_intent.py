"""Tests for Widget Studio template and direction detection."""

from __future__ import annotations

from backend.services.widget_intent import (
    detect_widget_intent_template,
    detect_widget_template,
)


class TestDetectWidgetTemplate:
    """Template classifier for single_metric vs spend_receive_pair."""

    def test_generic_spend_is_single_metric(self) -> None:
        """Generic spend question uses single-value template."""
        assert detect_widget_template("how much did I spend") == "single_metric"

    def test_spend_and_income_is_pair(self) -> None:
        """Both directions use spend_receive_pair."""
        assert (
            detect_widget_template("spend and income this month")
            == "spend_receive_pair"
        )

    def test_overview_is_pair(self) -> None:
        """Overview requests use pair template."""
        assert detect_widget_template("money overview") == "spend_receive_pair"


class TestDetectWidgetIntentTemplate:
    """Direction scoring for single_metric only."""

    def test_spend_expenses(self) -> None:
        """Spending language maps to spend direction."""
        assert detect_widget_intent_template("total spending this month") == "spend"

    def test_receive_income(self) -> None:
        """Income language maps to receive direction."""
        assert detect_widget_intent_template("salary received by month") == "receive"

    def test_pair_template_skips_direction(self) -> None:
        """Pair template returns no spend/receive direction hint."""
        assert detect_widget_intent_template("spend and income") is None

    def test_empty_message(self) -> None:
        """Empty input returns None."""
        assert detect_widget_intent_template("") is None
