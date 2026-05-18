"""Tests for Widget Studio prompt context intent injection."""

from __future__ import annotations

from backend.agents.widget_studio_prompts import build_widget_studio_user_context


class TestBuildWidgetStudioUserContext:
    """Template and direction hints appear in LLM context when detected."""

    def test_injects_single_metric_and_spend_direction(self) -> None:
        """Spending message includes template and SPEND direction."""
        text = build_widget_studio_user_context(
            "total spending by category",
            None,
            [{"role": "user", "content": "total spending by category"}],
        )
        assert "Detected widget template: single_metric" in text
        assert "Detected direction: SPEND" in text
        assert "Do not set category filters to a merchant" in text

    def test_injects_pair_template(self) -> None:
        """Spend and income uses spend_receive_pair guidance."""
        text = build_widget_studio_user_context(
            "spend and income overview",
            None,
            [{"role": "user", "content": "spend and income overview"}],
        )
        assert "Detected widget template: spend_receive_pair" in text
        assert "spend_receive_pair JSON" in text
