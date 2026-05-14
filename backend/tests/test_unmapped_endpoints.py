"""Tests for GET /categories/unmapped and POST /categories/resolve-unmapped."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers.categories import router as categories_router

# ---------------------------------------------------------------------------
# Test app + helpers
# ---------------------------------------------------------------------------

_unmapped_app = FastAPI()
_unmapped_app.include_router(categories_router)


def _client(db: MagicMock, user: MagicMock) -> TestClient:
    from backend.database import get_db
    from backend.middleware.auth import get_current_user

    _unmapped_app.dependency_overrides[get_db] = lambda: db
    _unmapped_app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(_unmapped_app, raise_server_exceptions=True)


def _reset() -> None:
    _unmapped_app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /categories/unmapped
# ---------------------------------------------------------------------------


class TestGetUnmapped:
    """Tests for the unmapped short descriptions list endpoint."""

    def teardown_method(self) -> None:
        _reset()

    def test_returns_list_shape(self) -> None:
        """Endpoint returns a JSON list (empty when no unmapped rows)."""
        db = MagicMock()
        db.execute.return_value.all.return_value = []
        user = MagicMock()
        user.id = "user-1"

        with patch("backend.routers.categories.set_rls_user"):
            c = _client(db, user)
            try:
                r = c.get("/categories/unmapped")
            finally:
                _reset()

        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_calls_set_rls(self) -> None:
        """RLS must be set before querying transactions."""
        db = MagicMock()
        db.execute.return_value.all.return_value = []
        user = MagicMock()
        user.id = "user-rls"

        with patch("backend.routers.categories.set_rls_user") as mock_rls:
            c = _client(db, user)
            try:
                c.get("/categories/unmapped")
            finally:
                _reset()

        mock_rls.assert_called_once_with(db, "user-rls")


# ---------------------------------------------------------------------------
# POST /categories/resolve-unmapped
# ---------------------------------------------------------------------------


class TestPostResolveUnmapped:
    """Tests for the resolve-unmapped endpoint."""

    def teardown_method(self) -> None:
        _reset()

    def test_requires_short_description(self) -> None:
        """Missing short_description returns 422."""
        db = MagicMock()
        user = MagicMock()
        user.id = "user-1"

        with patch("backend.routers.categories.set_rls_user"):
            c = _client(db, user)
            try:
                r = c.post(
                    "/categories/resolve-unmapped",
                    json={
                        "short_description": "",
                        "parent_category": "Food & Dining",
                        "sub_category": "Zomato",
                    },
                )
            finally:
                _reset()

        assert r.status_code == 422

    def test_requires_parent_and_sub(self) -> None:
        """Missing parent_category returns 422."""
        db = MagicMock()
        user = MagicMock()
        user.id = "user-1"

        with patch("backend.routers.categories.set_rls_user"):
            c = _client(db, user)
            try:
                r = c.post(
                    "/categories/resolve-unmapped",
                    json={
                        "short_description": "zomato",
                        "parent_category": "",
                        "sub_category": "Zomato",
                    },
                )
            finally:
                _reset()

        assert r.status_code == 422

    def test_creates_cm_and_categorizes(self) -> None:
        """Happy path: creates CM entry, updates transactions, returns count."""
        db = MagicMock()
        db.execute.return_value.scalar_one_or_none.return_value = None  # no existing CM
        db.execute.return_value.rowcount = 5  # 5 transactions updated
        user = MagicMock()
        user.id = "user-1"

        with patch("backend.routers.categories.set_rls_user"):
            c = _client(db, user)
            try:
                r = c.post(
                    "/categories/resolve-unmapped",
                    json={
                        "short_description": "zomato",
                        "parent_category": "Food & Dining",
                        "sub_category": "Zomato",
                    },
                )
            finally:
                _reset()

        assert r.status_code == 200
        body = r.json()
        assert body["short_description"] == "zomato"
        assert body["parent_category"] == "Food & Dining"
        assert body["sub_category"] == "Zomato"
        assert body["categorized_count"] == 5
        db.commit.assert_called()

    def test_reuses_existing_cm(self) -> None:
        """When CM entry already exists, it is reused (no duplicate created)."""
        existing_cm = MagicMock()
        existing_cm.id = "cm-existing-id"
        db = MagicMock()
        db.execute.return_value.scalar_one_or_none.return_value = existing_cm
        db.execute.return_value.rowcount = 3
        user = MagicMock()
        user.id = "user-1"

        with patch("backend.routers.categories.set_rls_user"):
            c = _client(db, user)
            try:
                r = c.post(
                    "/categories/resolve-unmapped",
                    json={
                        "short_description": "groww",
                        "parent_category": "Investment",
                        "sub_category": "Groww",
                    },
                )
            finally:
                _reset()

        assert r.status_code == 200
        assert r.json()["categorized_count"] == 3
        db.commit.assert_called()
