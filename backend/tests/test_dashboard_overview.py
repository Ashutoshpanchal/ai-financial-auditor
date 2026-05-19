"""Tests for dashboard overview aggregation service."""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock, patch

from backend.services.dashboard_overview import (
    _rollup_quarters,
    build_dashboard_overview,
)


class TestRollupQuarters:
    """Quarter rollup from monthly debit rows."""

    def test_rollup_indian_fy_quarters(self) -> None:
        """Apr–Jun → Q1; Jan–Mar → Q4."""
        by_month = [
            {"label": "2024-04", "debit": 100.0},
            {"label": "2024-05", "debit": 50.0},
            {"label": "2024-07", "debit": 200.0},
            {"label": "2025-01", "debit": 75.0},
        ]
        quarters = _rollup_quarters(by_month)
        assert len(quarters) == 4
        q_map = {q["label"]: q["debit"] for q in quarters}
        assert q_map["Q1"] == 150.0
        assert q_map["Q2"] == 200.0
        assert q_map["Q4"] == 75.0
        assert q_map["Q3"] == 0.0


class TestBuildDashboardOverview:
    """build_dashboard_overview composes widget queries."""

    @patch("backend.services.dashboard_overview.resolve_widget_data")
    @patch("backend.services.dashboard_overview._resolve_top_descriptions")
    @patch("backend.services.dashboard_overview._sum_investment_debits")
    def test_returns_expected_shape(
        self,
        mock_invest: MagicMock,
        mock_top_desc: MagicMock,
        mock_resolve: MagicMock,
    ) -> None:
        """Overview payload includes totals, months, quarters, and rankings."""
        mock_resolve.side_effect = [
            {"value": 700_574.0, "format": "currency"},
            {"value": 680_419.0, "format": "currency"},
            {"value": 138, "format": "number"},
            {"value": 1416, "format": "number"},
            [
                {"label": "2024-04", "value": 42_000.0},
                {"label": "2024-05", "value": 35_000.0},
            ],
            [
                {"label": "Groww SIP", "value": 172_000.0},
                {"label": "Food", "value": 50_000.0},
            ],
        ]
        mock_top_desc.return_value = [{"label": "ZOMATO", "value": 9800.0}]
        mock_invest.return_value = 172_000.0

        db = MagicMock()
        result = build_dashboard_overview(
            db,
            "user-1",
            date_from=date(2024, 4, 1),
            date_to=date(2025, 3, 31),
        )

        assert result["totals"]["credits"] == 700_574.0
        assert result["totals"]["debits"] == 680_419.0
        assert result["totals"]["net"] == 20_155.0
        assert result["totals"]["credit_count"] == 138
        assert len(result["by_month"]) == 2
        assert len(result["by_quarter"]) == 4
        assert result["top_categories"][0]["label"] == "Groww SIP"
        assert result["top_descriptions"][0]["label"] == "ZOMATO"
        assert result["investment_debits"] == 172_000.0
