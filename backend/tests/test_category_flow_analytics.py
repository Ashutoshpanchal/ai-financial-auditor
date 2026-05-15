"""Tests for category_flow_analytics.compute_category_flow."""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

import pytest

from backend.services.category_flow_analytics import (
    compute_category_flow,
    compute_category_flow_by_parent_month,
)


def _total_row(debit: float, credit: float, count: int) -> MagicMock:
    r = MagicMock()
    r.debit_total = debit
    r.credit_total = credit
    r.txn_count = count
    return r


def _grid_row(
    parent: str, month: str, sub: str, debit: float, credit: float, count: int
) -> MagicMock:
    r = MagicMock()
    r.parent_category = parent
    r.month = month
    r.sub_category = sub
    r.debit_total = debit
    r.credit_total = credit
    r.txn_count = count
    return r


def test_compute_returns_rows_and_totals() -> None:
    """Happy path: totals query + grouped rows are merged into the response dict."""
    db = MagicMock()
    exec_totals = MagicMock()
    exec_totals.one.return_value = _total_row(25.0, 0.0, 2)
    exec_grid = MagicMock()
    exec_grid.all.return_value = [
        _grid_row("Food", "2024-01", "Swiggy", 10.0, 0.0, 1),
        _grid_row("Food", "2024-02", "Swiggy", 15.0, 0.0, 1),
    ]
    db.execute.side_effect = [exec_totals, exec_grid]

    out = compute_category_flow(
        db=db,
        user_id="u1",
        date_from=date(2024, 1, 1),
        date_to=date(2024, 12, 31),
        parent_category="Food",
        sub_categories=None,
        mode="both",
    )

    assert out["totals"] == {"debit": 25.0, "credit": 0.0, "txn_count": 2}
    assert len(out["rows"]) == 2
    assert out["rows"][0]["month"] == "2024-01"
    assert out["rows"][0]["sub_category"] == "Swiggy"
    assert out["truncated"] is False


def test_empty_parent_raises() -> None:
    """Whitespace-only parent_category must raise ValueError."""
    db = MagicMock()
    with pytest.raises(ValueError, match="parent_category"):
        compute_category_flow(
            db=db,
            user_id="u1",
            date_from=date(2024, 1, 1),
            date_to=date(2024, 1, 31),
            parent_category="   ",
            sub_categories=None,
        )


def test_truncation_flag_when_over_limit() -> None:
    """When the grid returns more than MAX rows, response is truncated and flagged."""
    from backend.services import category_flow_analytics as m

    db = MagicMock()
    exec_totals = MagicMock()
    exec_totals.one.return_value = _total_row(1.0, 0.0, 99999)
    many = [
        _grid_row("Food", "2024-01", f"Sub{i}", 1.0, 0.0, 1)
        for i in range(m.MAX_CATEGORY_FLOW_ROWS + 1)
    ]
    exec_grid = MagicMock()
    exec_grid.all.return_value = many
    db.execute.side_effect = [exec_totals, exec_grid]

    out = compute_category_flow(
        db=db,
        user_id="u1",
        date_from=date(2024, 1, 1),
        date_to=date(2024, 12, 31),
        parent_category="Food",
        sub_categories=None,
    )

    assert out["truncated"] is True
    assert "truncated_reason" in out
    assert len(out["rows"]) == m.MAX_CATEGORY_FLOW_ROWS


def _parent_month_row(
    parent: str, month: str, debit: float, credit: float, count: int
) -> MagicMock:
    r = MagicMock()
    r.parent_category = parent
    r.month = month
    r.debit_total = debit
    r.credit_total = credit
    r.txn_count = count
    return r


def test_compute_by_parent_month_returns_rows() -> None:
    """Parent-by-month aggregate returns rows without sub_category."""
    db = MagicMock()
    exec_totals = MagicMock()
    exec_totals.one.return_value = _total_row(30.0, 5.0, 4)
    exec_grid = MagicMock()
    exec_grid.all.return_value = [
        _parent_month_row("Food", "2024-01", 10.0, 0.0, 1),
        _parent_month_row("Travel", "2024-01", 20.0, 5.0, 3),
    ]
    db.execute.side_effect = [exec_totals, exec_grid]

    out = compute_category_flow_by_parent_month(
        db=db,
        user_id="u1",
        date_from=date(2024, 1, 1),
        date_to=date(2024, 12, 31),
        mode="both",
    )

    assert out["totals"]["debit"] == 30.0
    assert len(out["rows"]) == 2
    assert "sub_category" not in out["rows"][0]
    assert out["rows"][0]["parent_category"] == "Food"
