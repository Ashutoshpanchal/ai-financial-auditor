"""Tests for GET /analytics/category-flow."""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers.analytics import router

app = FastAPI()
app.include_router(router)


def _make_user(user_id: str = "user-analytics-1") -> MagicMock:
    u = MagicMock()
    u.id = user_id
    return u


def _client(db: MagicMock, user: MagicMock) -> TestClient:
    from backend.database import get_db
    from backend.middleware.auth import get_current_user

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


def _reset() -> None:
    app.dependency_overrides.clear()


class TestTransactionDateScopeRouter:
    def setup_method(self) -> None:
        _reset()

    def test_200_returns_scope(self) -> None:
        db = MagicMock()
        payload = {
            "min_date": "2024-01-15",
            "max_date": "2026-04-01",
            "months_with_data": ["2024-01", "2026-04"],
            "has_transactions": True,
        }
        with (
            patch("backend.routers.analytics.set_rls_user"),
            patch(
                "backend.routers.analytics.compute_transaction_date_scope",
                return_value=payload,
            ) as mock_scope,
        ):
            client = _client(db, _make_user())
            r = client.get("/analytics/transaction-date-scope")
        assert r.status_code == 200
        assert r.json() == payload
        mock_scope.assert_called_once()
        assert mock_scope.call_args.kwargs["user_id"] == "user-analytics-1"


class TestCategoryFlowRouter:
    def setup_method(self) -> None:
        _reset()

    def test_422_when_date_from_after_date_to(self) -> None:
        db = MagicMock()
        client = _client(db, _make_user())
        with patch("backend.routers.analytics.set_rls_user"):
            r = client.get(
                "/analytics/category-flow",
                params={
                    "date_from": "2024-02-01",
                    "date_to": "2024-01-01",
                    "parent_category": "Food",
                },
            )
        assert r.status_code == 422

    def test_200_returns_payload(self) -> None:
        db = MagicMock()
        payload = {
            "rows": [],
            "totals": {"debit": 0.0, "credit": 0.0, "txn_count": 0},
            "truncated": False,
        }
        with (
            patch("backend.routers.analytics.set_rls_user"),
            patch(
                "backend.routers.analytics.compute_category_flow",
                return_value=payload,
            ) as mock_cf,
        ):
            client = _client(db, _make_user())
            r = client.get(
                "/analytics/category-flow",
                params={
                    "date_from": "2024-01-01",
                    "date_to": "2024-01-31",
                    "parent_category": "Food",
                    "mode": "debit",
                },
            )
        assert r.status_code == 200
        assert r.json() == payload
        mock_cf.assert_called_once()
        kwargs = mock_cf.call_args.kwargs
        assert kwargs["date_from"] == date(2024, 1, 1)
        assert kwargs["date_to"] == date(2024, 1, 31)
        assert kwargs["parent_category"] == "Food"
        assert kwargs["mode"] == "debit"


class TestCategoryFlowByParentRouter:
    def setup_method(self) -> None:
        _reset()

    def test_422_when_dates_inverted(self) -> None:
        db = MagicMock()
        client = _client(db, _make_user())
        with patch("backend.routers.analytics.set_rls_user"):
            r = client.get(
                "/analytics/category-flow-by-parent",
                params={"date_from": "2024-02-01", "date_to": "2024-01-01"},
            )
        assert r.status_code == 422

    def test_200_by_parent(self) -> None:
        db = MagicMock()
        payload = {
            "rows": [
                {
                    "parent_category": "Food",
                    "month": "2024-01",
                    "debit_total": 1.0,
                    "credit_total": 0.0,
                    "txn_count": 1,
                }
            ],
            "totals": {"debit": 1.0, "credit": 0.0, "txn_count": 1},
            "truncated": False,
        }
        with (
            patch("backend.routers.analytics.set_rls_user"),
            patch(
                "backend.routers.analytics.compute_category_flow_by_parent_month",
                return_value=payload,
            ) as mock_fn,
        ):
            client = _client(db, _make_user())
            r = client.get(
                "/analytics/category-flow-by-parent",
                params={
                    "date_from": "2024-01-01",
                    "date_to": "2024-01-31",
                    "mode": "credit",
                },
            )
        assert r.status_code == 200
        assert r.json() == payload
        mock_fn.assert_called_once()
        assert mock_fn.call_args.kwargs["mode"] == "credit"


class TestMetadataEndpoint:
    def setup_method(self) -> None:
        _reset()

    def test_422_when_dates_inverted(self) -> None:
        db = MagicMock()
        client = _client(db, _make_user())
        with patch("backend.routers.analytics.set_rls_user"):
            r = client.get(
                "/analytics/category-flow-by-parent/metadata",
                params={"date_from": "2024-02-01", "date_to": "2024-01-01"},
            )
        assert r.status_code == 422

    def test_200_returns_metadata(self) -> None:
        db = MagicMock()
        payload = {
            "date_from": "2024-01-01",
            "date_to": "2024-12-31",
            "months_available": ["2024-01", "2024-02", "2024-03"],
            "years": [2024],
            "total_rows": 9,
            "parent_categories": ["Food", "Travel", "Utilities"],
        }
        with (
            patch("backend.routers.analytics.set_rls_user"),
            patch(
                "backend.routers.analytics.compute_category_flow_metadata",
                return_value=payload,
            ) as mock_meta,
        ):
            client = _client(db, _make_user())
            r = client.get(
                "/analytics/category-flow-by-parent/metadata",
                params={
                    "date_from": "2024-01-01",
                    "date_to": "2024-12-31",
                },
            )
        assert r.status_code == 200
        assert r.json() == payload
        mock_meta.assert_called_once()
        kwargs = mock_meta.call_args.kwargs
        assert kwargs["date_from"] == date(2024, 1, 1)
        assert kwargs["date_to"] == date(2024, 12, 31)


class TestPaginatedEndpoint:
    def setup_method(self) -> None:
        _reset()

    def test_422_when_dates_inverted(self) -> None:
        db = MagicMock()
        client = _client(db, _make_user())
        with patch("backend.routers.analytics.set_rls_user"):
            r = client.get(
                "/analytics/category-flow-by-parent/paginated",
                params={"date_from": "2024-02-01", "date_to": "2024-01-01"},
            )
        assert r.status_code == 422

    def test_200_first_page(self) -> None:
        db = MagicMock()
        payload = {
            "rows": [
                {
                    "parent_category": "Food",
                    "month": "2024-01",
                    "debit_total": 10.0,
                    "credit_total": 0.0,
                    "txn_count": 1,
                }
            ],
            "pagination": {
                "current_cursor": None,
                "next_cursor": "2024-02",
                "has_more": True,
                "limit": 50,
                "rows_returned": 1,
            },
        }
        with (
            patch("backend.routers.analytics.set_rls_user"),
            patch(
                "backend.routers.analytics.compute_category_flow_by_parent_paginated",
                return_value=payload,
            ) as mock_paginated,
        ):
            client = _client(db, _make_user())
            r = client.get(
                "/analytics/category-flow-by-parent/paginated",
                params={
                    "date_from": "2024-01-01",
                    "date_to": "2024-12-31",
                    "mode": "both",
                    "limit": 50,
                },
            )
        assert r.status_code == 200
        assert r.json() == payload
        mock_paginated.assert_called_once()
        kwargs = mock_paginated.call_args.kwargs
        assert kwargs["date_from"] == date(2024, 1, 1)
        assert kwargs["date_to"] == date(2024, 12, 31)
        assert kwargs["mode"] == "both"
        assert kwargs["month_cursor"] is None
        assert kwargs["limit"] == 50

    def test_200_with_cursor(self) -> None:
        db = MagicMock()
        payload = {
            "rows": [
                {
                    "parent_category": "Food",
                    "month": "2024-02",
                    "debit_total": 15.0,
                    "credit_total": 0.0,
                    "txn_count": 1,
                }
            ],
            "pagination": {
                "current_cursor": "2024-02",
                "next_cursor": None,
                "has_more": False,
                "limit": 50,
                "rows_returned": 1,
            },
        }
        with (
            patch("backend.routers.analytics.set_rls_user"),
            patch(
                "backend.routers.analytics.compute_category_flow_by_parent_paginated",
                return_value=payload,
            ) as mock_paginated,
        ):
            client = _client(db, _make_user())
            r = client.get(
                "/analytics/category-flow-by-parent/paginated",
                params={
                    "date_from": "2024-01-01",
                    "date_to": "2024-12-31",
                    "mode": "debit",
                    "month_cursor": "2024-02",
                    "limit": 50,
                },
            )
        assert r.status_code == 200
        assert r.json() == payload
        kwargs = mock_paginated.call_args.kwargs
        assert kwargs["month_cursor"] == "2024-02"
        assert kwargs["mode"] == "debit"
