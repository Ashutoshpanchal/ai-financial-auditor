"""Tests for widget query placeholder resolution."""

from __future__ import annotations

from datetime import date

import pytest

from backend.services.widget_placeholders import (
    PLACEHOLDER_DATE_FROM,
    PLACEHOLDER_DATE_TO,
    PLACEHOLDER_PARENT_CATEGORY,
    resolve_query_config_placeholders,
    validate_placeholder_filter_values,
)


class TestResolvePlaceholders:
    """resolve_query_config_placeholders merges runtime filters correctly."""

    def test_date_placeholders_use_runtime(self) -> None:
        """Runtime dates replace {{date_from}}/{{date_to}} in filters."""
        config = {
            "aggregation": "sum",
            "field": "debit",
            "group_by": "day",
            "filters": {
                "date_from": PLACEHOLDER_DATE_FROM,
                "date_to": PLACEHOLDER_DATE_TO,
            },
        }
        resolved, runtime = resolve_query_config_placeholders(
            config,
            date_from=date(2026, 3, 1),
            date_to=date(2026, 3, 31),
        )
        assert runtime.date_from == date(2026, 3, 1)
        assert runtime.date_to == date(2026, 3, 31)
        assert "date_from" not in (resolved.get("filters") or {})

    def test_parent_category_placeholder(self) -> None:
        """Parent category placeholder promotes to runtime."""
        config = {
            "aggregation": "sum",
            "field": "debit",
            "filters": {"parent_category": PLACEHOLDER_PARENT_CATEGORY},
        }
        _, runtime = resolve_query_config_placeholders(
            config,
            parent_category="Food & Dining",
        )
        assert runtime.parent_category == "Food & Dining"

    def test_default_month_for_preview(self) -> None:
        """Unresolved date placeholders default to current month in preview."""
        config = {
            "aggregation": "sum",
            "field": "debit",
            "filters": {
                "date_from": PLACEHOLDER_DATE_FROM,
                "date_to": PLACEHOLDER_DATE_TO,
            },
        }
        _, runtime = resolve_query_config_placeholders(
            config,
            default_month_for_preview=True,
        )
        today = date.today()
        assert runtime.date_from == date(today.year, today.month, 1)
        last = runtime.date_to
        assert last is not None
        assert last.month == today.month


class TestValidatePlaceholders:
    """validate_placeholder_filter_values rejects unknown tokens."""

    def test_accepts_known_placeholder(self) -> None:
        """Known placeholders pass validation."""
        validate_placeholder_filter_values(
            {"filters": {"date_from": PLACEHOLDER_DATE_FROM}}
        )

    def test_rejects_unknown_placeholder(self) -> None:
        """Unknown {{token}} values raise ValueError."""
        with pytest.raises(ValueError, match="Unknown placeholder"):
            validate_placeholder_filter_values(
                {"filters": {"date_from": "{{unknown_token}}"}}
            )
