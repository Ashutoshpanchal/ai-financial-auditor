"""Tests for Widget Studio reply parsing (strip JSON from chat, extract widget)."""

from __future__ import annotations

from backend.agents.nodes import (
    _extract_widget_suggestion,
    strip_widget_json_from_reply,
)


class TestWidgetStudioReplyParsing:
    """strip_widget_json_from_reply and _extract_widget_suggestion stay in sync."""

    _SAMPLE = (
        "I'm generating your widget. This shows highest food spend.\n\n"
        "```json\n"
        "{\n"
        '  "title": "Highest Single Food Spend",\n'
        '  "widget_type": "metric",\n'
        '  "query_config": {\n'
        '    "aggregation": "max",\n'
        '    "field": "debit",\n'
        '    "format": "currency",\n'
        '    "filters": {\n'
        '      "transaction_type": "debit",\n'
        '      "date_from": "{{date_from}}",\n'
        '      "date_to": "{{date_to}}",\n'
        '      "parent_category": "Food"\n'
        "    }\n"
        "  }\n"
        "}\n"
        "```"
    )

    def test_strip_removes_json_fence(self) -> None:
        """Chat display text must not contain the json block."""
        display = strip_widget_json_from_reply(self._SAMPLE)
        assert "```" not in display
        assert "widget_type" not in display
        assert "generating your widget" in display.lower()

    def test_extract_parses_food_metric(self) -> None:
        """Parser returns widget dict for a valid fenced block."""
        widget = _extract_widget_suggestion(self._SAMPLE)
        assert widget is not None
        assert widget["title"] == "Highest Single Food Spend"
        assert widget["widget_type"] == "metric"
        cfg = widget["query_config"]
        assert cfg["aggregation"] == "max"
        assert cfg["filters"]["parent_category"] == "Food"
