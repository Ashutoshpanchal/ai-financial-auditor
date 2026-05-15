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
