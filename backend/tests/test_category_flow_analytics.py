"""Tests for category_flow_analytics.compute_category_flow."""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

import pytest

from backend.services.category_flow_analytics import (
    compute_category_flow,
    compute_category_flow_by_parent_month,
    compute_category_flow_by_parent_paginated,
    compute_category_flow_metadata,
    compute_transaction_date_scope,
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


def test_metadata_returns_months_years_totals() -> None:
    """Metadata query returns distinct months, years, total rows, and parents."""
    db = MagicMock()

    # Mock distinct months query
    months_exec = MagicMock()
    months_exec.all.return_value = [
        MagicMock(month="2024-01"),
        MagicMock(month="2024-02"),
        MagicMock(month="2024-03"),
    ]

    # Mock total rows (distinct parent, month groups) = 9
    count_exec = MagicMock()
    count_exec.scalar.return_value = 9

    # Mock distinct parents query
    parents_exec = MagicMock()
    parents_exec.all.return_value = [
        MagicMock(parent_category="Food"),
        MagicMock(parent_category="Travel"),
        MagicMock(parent_category="Utilities"),
    ]

    db.execute.side_effect = [months_exec, parents_exec]
    db.scalar.return_value = 9

    out = compute_category_flow_metadata(
        db=db,
        user_id="u1",
        date_from=date(2024, 1, 1),
        date_to=date(2024, 3, 31),
    )

    assert out["months_available"] == ["2024-01", "2024-02", "2024-03"]
    assert out["years"] == [2024]
    assert out["total_rows"] == 9
    assert out["parent_categories"] == ["Food", "Travel", "Utilities"]
    assert out["date_from"] == "2024-01-01"
    assert out["date_to"] == "2024-03-31"


def test_transaction_date_scope_with_data() -> None:
    """Scope returns min/max ISO dates and sorted months."""
    db = MagicMock()
    db.scalar.side_effect = [date(2024, 3, 12), date(2026, 4, 28)]
    months_exec = MagicMock()
    months_exec.all.return_value = [
        MagicMock(month="2024-03"),
        MagicMock(month="2024-04"),
        MagicMock(month="2026-04"),
    ]
    db.execute.return_value = months_exec

    out = compute_transaction_date_scope(db=db, user_id="u1")

    assert out["min_date"] == "2024-03-12"
    assert out["max_date"] == "2026-04-28"
    assert out["months_with_data"] == ["2024-03", "2024-04", "2026-04"]
    assert out["has_transactions"] is True


def test_transaction_date_scope_empty_user() -> None:
    """Scope with no transactions returns null dates and empty months."""
    db = MagicMock()
    db.scalar.side_effect = [None, None]
    months_exec = MagicMock()
    months_exec.all.return_value = []
    db.execute.return_value = months_exec

    out = compute_transaction_date_scope(db=db, user_id="u1")

    assert out["min_date"] is None
    assert out["max_date"] is None
    assert out["months_with_data"] == []
    assert out["has_transactions"] is False


def test_metadata_empty_range_returns_zeros() -> None:
    """Metadata with no rows returns empty lists and zero totals."""
    db = MagicMock()

    months_exec = MagicMock()
    months_exec.all.return_value = []

    parents_exec = MagicMock()
    parents_exec.all.return_value = []

    db.execute.side_effect = [months_exec, parents_exec]
    db.scalar.return_value = 0

    out = compute_category_flow_metadata(
        db=db,
        user_id="u1",
        date_from=date(2024, 1, 1),
        date_to=date(2024, 1, 31),
    )

    assert out["months_available"] == []
    assert out["years"] == []
    assert out["total_rows"] == 0
    assert out["parent_categories"] == []


def test_paginated_returns_rows_and_cursor() -> None:
    """Paginated query returns rows and has_more=True when limit+1 rows exist."""
    db = MagicMock()

    # Return limit+1 rows to trigger has_more
    rows = [
        _parent_month_row("Food", "2024-01", 10.0, 0.0, 1),
        _parent_month_row("Food", "2024-02", 15.0, 0.0, 1),
        _parent_month_row("Food", "2024-03", 20.0, 0.0, 1),  # This is the +1
    ]

    exec_obj = MagicMock()
    exec_obj.all.return_value = rows

    db.execute.return_value = exec_obj

    out = compute_category_flow_by_parent_paginated(
        db=db,
        user_id="u1",
        date_from=date(2024, 1, 1),
        date_to=date(2024, 12, 31),
        mode="both",
        month_cursor=None,
        limit=2,
    )

    assert out["pagination"]["has_more"] is True
    assert out["pagination"]["next_cursor"] == "2024-03"
    assert len(out["rows"]) == 2
    assert out["rows"][0]["month"] == "2024-01"
    assert out["rows"][1]["month"] == "2024-02"
    assert out["pagination"]["rows_returned"] == 2


def test_paginated_last_page_has_no_cursor() -> None:
    """Paginated query returns has_more=False and next_cursor=None on last page."""
    db = MagicMock()

    rows = [
        _parent_month_row("Food", "2024-01", 10.0, 0.0, 1),
        _parent_month_row("Food", "2024-02", 15.0, 0.0, 1),
    ]

    exec_obj = MagicMock()
    exec_obj.all.return_value = rows

    db.execute.return_value = exec_obj

    out = compute_category_flow_by_parent_paginated(
        db=db,
        user_id="u1",
        date_from=date(2024, 1, 1),
        date_to=date(2024, 12, 31),
        mode="both",
        month_cursor=None,
        limit=2,
    )

    assert out["pagination"]["has_more"] is False
    assert out["pagination"]["next_cursor"] is None
    assert len(out["rows"]) == 2
