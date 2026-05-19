"""Tests for broken widget detection and API payloads."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from backend.models.widget_studio import WidgetDefinition
from backend.widget_studio.broken_widget import (
    hardcoded_filters_from_query_config,
    mark_widget_broken_if_needed,
    query_config_category_still_valid,
    widget_broken_response,
)
from backend.widget_studio.vocabulary import WIDGET_BROKEN_ERROR


def test_hardcoded_filters_from_query_config_literal_categories() -> None:
    """Extract parent/sub labels when not template placeholders."""
    cfg = {
        "filters": {
            "parent_category": "Food",
            "sub_category": "Groceries",
        }
    }
    assert hardcoded_filters_from_query_config(cfg) == {
        "parent_label": "Food",
        "sub_label": "Groceries",
    }


def test_hardcoded_filters_from_query_config_skips_placeholders() -> None:
    """Template placeholders are not treated as hardcoded filters."""
    cfg = {
        "filters": {
            "parent_category": "{{parent_category}}",
            "sub_category": "Groceries",
        }
    }
    assert hardcoded_filters_from_query_config(cfg) == {"sub_label": "Groceries"}


def test_widget_broken_response_shape() -> None:
    """Standard broken payload uses WIDGET_BROKEN error code."""
    payload = widget_broken_response()
    assert payload["error"] == WIDGET_BROKEN_ERROR
    assert "delete" in payload["message"].lower()


@patch(
    "backend.widget_studio.broken_widget.category_filters_still_valid",
    return_value=False,
)
def test_mark_widget_broken_if_needed_sets_flag(
    _mock_valid: MagicMock,
) -> None:
    """Missing category marks widget broken and commits."""
    widget = WidgetDefinition(
        id="w1",
        user_id="u1",
        name="Test",
        type="metric",
        intent_text="x",
        abstract_query="q",
        resolved_query="q",
        hardcoded_filters={"parent_label": "Gone"},
        broken=False,
    )
    db = MagicMock()
    assert mark_widget_broken_if_needed(widget, "u1", db) is True
    assert widget.broken is True
    db.commit.assert_called_once()


@patch(
    "backend.widget_studio.broken_widget.category_filters_still_valid",
    return_value=True,
)
def test_query_config_category_still_valid_delegates(
    mock_valid: MagicMock,
) -> None:
    """Dashboard query_config validation uses extracted hardcoded filters."""
    cfg = {"filters": {"parent_category": "Food"}}
    db = MagicMock()
    assert query_config_category_still_valid(cfg, "u1", db) is True
    mock_valid.assert_called_once()
