"""Tests for backend.routers.dashboard — dashboard widget CRUD and layout endpoints.

Uses FastAPI TestClient with mocked get_db and get_current_user dependencies.
No real database is required.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers.dashboard import router

# ---------------------------------------------------------------------------
# App + dependency overrides
# ---------------------------------------------------------------------------

app = FastAPI()
app.include_router(router)

USER_ID = "user-router-test"
WIDGET_ID = "widget-uuid-001"


def _make_user(user_id: str = USER_ID) -> MagicMock:
    """Return a minimal mock User object."""
    user = MagicMock()
    user.id = user_id
    return user


def _make_widget(
    widget_id: str = WIDGET_ID,
    user_id: str = USER_ID,
    title: str = "Test Widget",
    widget_type: str = "metric",
    query_config: dict | None = None,
    is_default: bool = False,
) -> MagicMock:
    """Return a mock UserWidget ORM object."""
    w = MagicMock()
    w.id = widget_id
    w.user_id = user_id
    w.title = title
    w.widget_type = widget_type
    w.query_config = query_config or {"aggregation": "sum", "field": "credit"}
    w.is_default = is_default
    w.created_at = "2024-01-01T00:00:00"
    return w


def _make_db() -> MagicMock:
    """Return a generic mock Session."""
    return MagicMock()


def _client_with_overrides(db: MagicMock, user: MagicMock) -> TestClient:
    """Build a TestClient with get_db and get_current_user overridden."""
    from backend.database import get_db
    from backend.middleware.auth import get_current_user

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


def _reset_overrides() -> None:
    """Clear all FastAPI dependency overrides."""
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /dashboard/widgets
# ---------------------------------------------------------------------------


class TestListWidgets:
    """GET /dashboard/widgets — returns list of widgets for the current user."""

    def setup_method(self) -> None:
        """Reset dependency overrides before each test."""
        _reset_overrides()

    def _make_list_db(self, widgets: list) -> MagicMock:
        """Return a mock DB whose execute().scalars().all() returns *widgets*."""
        db = _make_db()
        execute_result = MagicMock()
        execute_result.scalars.return_value.all.return_value = widgets
        db.execute.return_value = execute_result
        return db

    def test_returns_200_with_list(self) -> None:
        """GET /dashboard/widgets must return 200 and a JSON list."""
        widget = _make_widget()
        db = self._make_list_db([widget])
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.get("/dashboard/widgets")

        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert len(body) == 1

    def test_returns_empty_list_when_no_widgets(self) -> None:
        """GET /dashboard/widgets must return [] when user has no widgets."""
        db = self._make_list_db([])
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.get("/dashboard/widgets")

        assert response.status_code == 200
        assert response.json() == []

    def test_response_contains_widget_fields(self) -> None:
        """Each widget in the list must contain id, title, widget_type, query_config."""
        widget = _make_widget(title="My Widget", widget_type="bar_chart")
        db = self._make_list_db([widget])
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.get("/dashboard/widgets")

        item = response.json()[0]
        assert item["id"] == WIDGET_ID
        assert item["title"] == "My Widget"
        assert item["widget_type"] == "bar_chart"
        assert "query_config" in item


# ---------------------------------------------------------------------------
# POST /dashboard/widgets
# ---------------------------------------------------------------------------


class TestCreateWidget:
    """POST /dashboard/widgets — creates widget, 422 on bad widget_type."""

    def setup_method(self) -> None:
        """Reset dependency overrides before each test."""
        _reset_overrides()

    def _make_create_db(self, widget: MagicMock) -> MagicMock:
        """Return a mock DB that supports add/commit/refresh for widget creation."""
        db = _make_db()
        db.add = MagicMock()
        db.commit = MagicMock()
        db.refresh = MagicMock(side_effect=lambda w: None)
        return db

    def test_creates_widget_returns_201(self) -> None:
        """POST with valid body must return 201 Created."""
        widget = _make_widget()
        db = self._make_create_db(widget)
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.post(
                "/dashboard/widgets",
                json={
                    "title": "New Widget",
                    "widget_type": "metric",
                    "query_config": {"aggregation": "sum", "field": "credit"},
                },
            )

        assert response.status_code == 201

    def test_creates_widget_calls_db_add_and_commit(self) -> None:
        """db.add and db.commit must be called on successful creation."""
        widget = _make_widget()
        db = self._make_create_db(widget)
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            client.post(
                "/dashboard/widgets",
                json={
                    "title": "New Widget",
                    "widget_type": "bar_chart",
                    "query_config": {
                        "aggregation": "sum",
                        "field": "debit",
                        "group_by": "month",
                    },
                },
            )

        db.add.assert_called_once()
        db.commit.assert_called_once()

    def test_invalid_widget_type_returns_422(self) -> None:
        """POST with an invalid widget_type must return 422 Unprocessable Entity."""
        db = _make_db()
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.post(
                "/dashboard/widgets",
                json={
                    "title": "Bad Widget",
                    "widget_type": "unknown_type",
                    "query_config": {"aggregation": "sum", "field": "debit"},
                },
            )

        assert response.status_code == 422

    def test_all_valid_widget_types_return_201(self) -> None:
        """Each of metric / bar_chart / pie_chart / line_chart must be accepted."""
        valid_types = ["metric", "bar_chart", "pie_chart", "line_chart"]
        for wt in valid_types:
            db = _make_db()
            db.add = MagicMock()
            db.commit = MagicMock()
            db.refresh = MagicMock()
            user = _make_user()

            if wt == "metric":
                qcfg = {"aggregation": "sum", "field": "credit"}
            else:
                qcfg = {
                    "aggregation": "sum",
                    "field": "credit",
                    "group_by": "month",
                }

            with patch("backend.routers.dashboard.set_rls_user"):
                client = _client_with_overrides(db, user)
                response = client.post(
                    "/dashboard/widgets",
                    json={
                        "title": f"Widget {wt}",
                        "widget_type": wt,
                        "query_config": qcfg,
                    },
                )

            assert response.status_code == 201, f"Expected 201 for widget_type={wt}"

    def test_metric_with_group_by_returns_422(self) -> None:
        """POST metric widget with group_by must fail validation."""
        db = _make_db()
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.post(
                "/dashboard/widgets",
                json={
                    "title": "Bad metric",
                    "widget_type": "metric",
                    "query_config": {
                        "aggregation": "sum",
                        "field": "credit",
                        "group_by": "month",
                    },
                },
            )

        assert response.status_code == 422

    def test_chart_without_group_by_returns_422(self) -> None:
        """POST chart widget without group_by must fail validation."""
        db = _make_db()
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.post(
                "/dashboard/widgets",
                json={
                    "title": "Bad chart",
                    "widget_type": "bar_chart",
                    "query_config": {"aggregation": "sum", "field": "credit"},
                },
            )

        assert response.status_code == 422

    def test_missing_title_returns_422(self) -> None:
        """POST without 'title' must return 422 (Pydantic validation)."""
        db = _make_db()
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.post(
                "/dashboard/widgets",
                json={
                    "widget_type": "metric",
                    "query_config": {"aggregation": "sum", "field": "credit"},
                },
            )

        assert response.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /dashboard/widgets/{widget_id}
# ---------------------------------------------------------------------------


class TestUpdateWidget:
    """PATCH /dashboard/widgets/{id} — updates widget, 404 on missing."""

    def setup_method(self) -> None:
        """Reset dependency overrides before each test."""
        _reset_overrides()

    def _make_update_db(self, widget: MagicMock | None) -> MagicMock:
        """Return a mock DB for update — scalar_one_or_none returns *widget*."""
        db = _make_db()
        execute_result = MagicMock()
        execute_result.scalar_one_or_none.return_value = widget
        db.execute.return_value = execute_result
        db.commit = MagicMock()
        db.refresh = MagicMock()
        return db

    def test_updates_title_returns_200(self) -> None:
        """PATCH with a new title must return 200."""
        widget = _make_widget()
        db = self._make_update_db(widget)
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.patch(
                f"/dashboard/widgets/{WIDGET_ID}",
                json={"title": "Updated Title"},
            )

        assert response.status_code == 200

    def test_updates_title_on_widget_object(self) -> None:
        """PATCH must set the new title on the widget ORM object."""
        widget = _make_widget()
        db = self._make_update_db(widget)
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            client.patch(
                f"/dashboard/widgets/{WIDGET_ID}",
                json={"title": "New Title"},
            )

        assert widget.title == "New Title"

    def test_updates_query_config(self) -> None:
        """PATCH with new query_config must update the widget's query_config."""
        widget = _make_widget()
        db = self._make_update_db(widget)
        user = _make_user()
        new_config = {"aggregation": "avg", "field": "debit"}

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            client.patch(
                f"/dashboard/widgets/{WIDGET_ID}",
                json={"query_config": new_config},
            )

        assert widget.query_config == new_config

    def test_invalid_query_config_returns_422(self) -> None:
        """PATCH with invalid query_config for widget_type must return 422."""
        widget = _make_widget(widget_type="metric")
        db = self._make_update_db(widget)
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.patch(
                f"/dashboard/widgets/{WIDGET_ID}",
                json={
                    "query_config": {
                        "aggregation": "sum",
                        "field": "debit",
                        "group_by": "month",
                    },
                },
            )

        assert response.status_code == 422

    def test_missing_widget_returns_404(self) -> None:
        """PATCH on a non-existent widget must return 404."""
        db = self._make_update_db(None)
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.patch(
                "/dashboard/widgets/ghost-id",
                json={"title": "Ghost"},
            )

        assert response.status_code == 404

    def test_commit_called_on_success(self) -> None:
        """db.commit must be called after a successful update."""
        widget = _make_widget()
        db = self._make_update_db(widget)
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            client.patch(
                f"/dashboard/widgets/{WIDGET_ID}",
                json={"title": "Any"},
            )

        db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# DELETE /dashboard/widgets/{widget_id}
# ---------------------------------------------------------------------------


class TestDeleteWidget:
    """DELETE /dashboard/widgets/{id} — 204 on success, 404 on missing."""

    def setup_method(self) -> None:
        """Reset dependency overrides before each test."""
        _reset_overrides()

    def _make_delete_db(
        self,
        widget: MagicMock | None,
        dashboard: MagicMock | None = None,
    ) -> MagicMock:
        """Return a mock DB for delete — two execute calls: widget then dashboard."""
        db = _make_db()

        widget_result = MagicMock()
        widget_result.scalar_one_or_none.return_value = widget

        dashboard_result = MagicMock()
        dashboard_result.scalar_one_or_none.return_value = dashboard

        db.execute.side_effect = [widget_result, dashboard_result]
        db.delete = MagicMock()
        db.commit = MagicMock()
        return db

    def test_delete_existing_widget_returns_204(self) -> None:
        """DELETE on an existing widget must return 204 No Content."""
        widget = _make_widget()
        db = self._make_delete_db(widget)
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.delete(f"/dashboard/widgets/{WIDGET_ID}")

        assert response.status_code == 204

    def test_delete_calls_db_delete_and_commit(self) -> None:
        """db.delete and db.commit must be called on a successful deletion."""
        widget = _make_widget()
        db = self._make_delete_db(widget)
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            client.delete(f"/dashboard/widgets/{WIDGET_ID}")

        db.delete.assert_called_once_with(widget)
        db.commit.assert_called_once()

    def test_delete_missing_widget_returns_404(self) -> None:
        """DELETE on a non-existent widget must return 404."""
        # When widget is None, only one execute call happens (no dashboard lookup)
        db = _make_db()
        widget_result = MagicMock()
        widget_result.scalar_one_or_none.return_value = None
        db.execute.return_value = widget_result
        db.delete = MagicMock()
        db.commit = MagicMock()
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.delete("/dashboard/widgets/ghost-id")

        assert response.status_code == 404

    def test_delete_removes_widget_from_layout_grid(self) -> None:
        """After deletion the widget_id must be removed from the dashboard layout grid."""
        widget = _make_widget()

        dashboard = MagicMock()
        dashboard.layout = {
            "cols": 3,
            "grid": [
                {"widget_id": WIDGET_ID, "row": 0, "col": 0},
                {"widget_id": "other-widget", "row": 0, "col": 1},
            ],
        }

        db = self._make_delete_db(widget, dashboard)
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            client.delete(f"/dashboard/widgets/{WIDGET_ID}")

        # The layout grid on the dashboard object should have been updated
        updated_grid = dashboard.layout["grid"]
        widget_ids = [e["widget_id"] for e in updated_grid]
        assert WIDGET_ID not in widget_ids
        assert "other-widget" in widget_ids


# ---------------------------------------------------------------------------
# GET /dashboard/widgets/{widget_id}
# ---------------------------------------------------------------------------


class TestGetWidget:
    """GET /dashboard/widgets/{id} — single widget, 404 on missing."""

    def setup_method(self) -> None:
        """Reset dependency overrides before each test."""
        _reset_overrides()

    def test_returns_200(self) -> None:
        """GET must return one widget dict."""
        widget = _make_widget()
        db = _make_db()
        execute_result = MagicMock()
        execute_result.scalar_one_or_none.return_value = widget
        db.execute.return_value = execute_result
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.get(f"/dashboard/widgets/{WIDGET_ID}")

        assert response.status_code == 200
        assert response.json()["id"] == WIDGET_ID

    def test_missing_returns_404(self) -> None:
        """GET for unknown id must return 404."""
        db = _make_db()
        execute_result = MagicMock()
        execute_result.scalar_one_or_none.return_value = None
        db.execute.return_value = execute_result
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.get("/dashboard/widgets/ghost")

        assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /dashboard/widgets/preview
# ---------------------------------------------------------------------------


class TestPreviewWidget:
    """POST /dashboard/widgets/preview — returns data and human_query."""

    def setup_method(self) -> None:
        """Reset dependency overrides before each test."""
        _reset_overrides()

    def test_returns_200_with_mock_resolve(self) -> None:
        """Preview must return data and human_query."""
        db = _make_db()
        user = _make_user()
        mock_data = {"value": 42.0, "format": "currency"}

        with (
            patch("backend.routers.dashboard.set_rls_user"),
            patch(
                "backend.routers.dashboard.resolve_widget_data",
                return_value=mock_data,
            ),
        ):
            client = _client_with_overrides(db, user)
            response = client.post(
                "/dashboard/widgets/preview",
                json={
                    "widget_type": "metric",
                    "query_config": {
                        "aggregation": "sum",
                        "field": "debit",
                        "format": "currency",
                    },
                },
            )

        assert response.status_code == 200
        body = response.json()
        assert body["data"] == mock_data
        assert "human_query" in body
        assert "your_transactions" in body["human_query"]

    def test_invalid_config_returns_422(self) -> None:
        """Preview with metric + group_by must return 422."""
        db = _make_db()
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.post(
                "/dashboard/widgets/preview",
                json={
                    "widget_type": "metric",
                    "query_config": {
                        "aggregation": "sum",
                        "field": "debit",
                        "group_by": "month",
                    },
                },
            )

        assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /dashboard/widgets/{widget_id}/data
# ---------------------------------------------------------------------------


class TestGetWidgetData:
    """GET /dashboard/widgets/{id}/data — returns data, 404 on missing, 422 on bad config."""

    def setup_method(self) -> None:
        """Reset dependency overrides before each test."""
        _reset_overrides()

    def _make_data_db(self, widget: MagicMock | None) -> MagicMock:
        """Return a mock DB for the data endpoint."""
        db = _make_db()
        execute_result = MagicMock()
        execute_result.scalar_one_or_none.return_value = widget
        db.execute.return_value = execute_result
        return db

    def test_returns_200_with_metric_data(self) -> None:
        """GET /data for a valid metric widget must return 200 with value+format."""
        widget = _make_widget(
            query_config={"aggregation": "sum", "field": "credit", "format": "currency"}
        )
        db = self._make_data_db(widget)
        user = _make_user()
        mock_data = {"value": 1234.56, "format": "currency"}

        with (
            patch("backend.routers.dashboard.set_rls_user"),
            patch(
                "backend.routers.dashboard.resolve_widget_data",
                return_value=mock_data,
            ),
        ):
            client = _client_with_overrides(db, user)
            response = client.get(f"/dashboard/widgets/{WIDGET_ID}/data")

        assert response.status_code == 200
        body = response.json()
        assert body["value"] == 1234.56
        assert body["format"] == "currency"

    def test_returns_200_with_chart_data(self) -> None:
        """GET /data for a chart widget must return 200 with a list."""
        widget = _make_widget(
            widget_type="bar_chart",
            query_config={"aggregation": "sum", "field": "debit", "group_by": "month"},
        )
        db = self._make_data_db(widget)
        user = _make_user()
        mock_data = [{"label": "2024-01", "value": 500.0}]

        with (
            patch("backend.routers.dashboard.set_rls_user"),
            patch(
                "backend.routers.dashboard.resolve_widget_data",
                return_value=mock_data,
            ),
        ):
            client = _client_with_overrides(db, user)
            response = client.get(f"/dashboard/widgets/{WIDGET_ID}/data")

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_missing_widget_returns_404(self) -> None:
        """GET /data for a non-existent widget must return 404."""
        db = self._make_data_db(None)
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.get("/dashboard/widgets/ghost-id/data")

        assert response.status_code == 404

    def test_bad_config_returns_422(self) -> None:
        """GET /data when resolve_widget_data raises ValueError must return 422."""
        widget = _make_widget(query_config={"aggregation": "invalid", "field": "debit"})
        db = self._make_data_db(widget)
        user = _make_user()

        with (
            patch("backend.routers.dashboard.set_rls_user"),
            patch(
                "backend.routers.dashboard.resolve_widget_data",
                side_effect=ValueError("Invalid aggregation 'invalid'"),
            ),
        ):
            client = _client_with_overrides(db, user)
            response = client.get(f"/dashboard/widgets/{WIDGET_ID}/data")

        assert response.status_code == 422

    def test_query_params_passed_through(self) -> None:
        """date_from, date_to, bank_name, category query params must be forwarded."""
        widget = _make_widget()
        db = self._make_data_db(widget)
        user = _make_user()

        captured_kwargs: dict = {}

        def capture_resolve(**kwargs):
            """Capture kwargs forwarded to resolve_widget_data."""
            captured_kwargs.update(kwargs)
            return {"value": 0.0, "format": "number"}

        with (
            patch("backend.routers.dashboard.set_rls_user"),
            patch(
                "backend.routers.dashboard.resolve_widget_data",
                side_effect=capture_resolve,
            ),
        ):
            client = _client_with_overrides(db, user)
            client.get(
                f"/dashboard/widgets/{WIDGET_ID}/data",
                params={
                    "date_from": "2024-01-01",
                    "date_to": "2024-06-30",
                    "bank_name": "Chase",
                    "category": "Groceries",
                },
            )

        from datetime import date

        assert captured_kwargs.get("bank_name") == "Chase"
        assert captured_kwargs.get("category") == "Groceries"
        assert captured_kwargs.get("date_from") == date(2024, 1, 1)
        assert captured_kwargs.get("date_to") == date(2024, 6, 30)


# ---------------------------------------------------------------------------
# GET /dashboard/layout
# ---------------------------------------------------------------------------


class TestGetLayout:
    """GET /dashboard/layout — returns layout or default."""

    def setup_method(self) -> None:
        """Reset dependency overrides before each test."""
        _reset_overrides()

    def _make_layout_db(self, dashboard: MagicMock | None) -> MagicMock:
        """Return a mock DB for the layout GET endpoint."""
        db = _make_db()
        execute_result = MagicMock()
        execute_result.scalar_one_or_none.return_value = dashboard
        db.execute.return_value = execute_result
        return db

    def test_returns_default_when_no_dashboard(self) -> None:
        """GET /layout with no saved dashboard must return the default empty layout."""
        db = self._make_layout_db(None)
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.get("/dashboard/layout")

        assert response.status_code == 200
        body = response.json()
        assert body == {"cols": 3, "grid": []}

    def test_returns_saved_layout_when_dashboard_exists(self) -> None:
        """GET /layout must return the saved layout when a UserDashboard row exists."""
        saved_layout = {"cols": 4, "grid": [{"widget_id": "w1", "row": 0, "col": 0}]}
        dashboard = MagicMock()
        dashboard.layout = saved_layout

        db = self._make_layout_db(dashboard)
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.get("/dashboard/layout")

        assert response.status_code == 200
        assert response.json() == saved_layout

    def test_returns_200_status(self) -> None:
        """GET /layout must always return 200 OK."""
        db = self._make_layout_db(None)
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.get("/dashboard/layout")

        assert response.status_code == 200


# ---------------------------------------------------------------------------
# PUT /dashboard/layout
# ---------------------------------------------------------------------------


class TestSaveLayout:
    """PUT /dashboard/layout — saves layout (upsert)."""

    def setup_method(self) -> None:
        """Reset dependency overrides before each test."""
        _reset_overrides()

    def _make_save_db(self, existing_dashboard: MagicMock | None) -> MagicMock:
        """Return a mock DB for the layout PUT endpoint."""
        db = _make_db()
        execute_result = MagicMock()
        execute_result.scalar_one_or_none.return_value = existing_dashboard
        db.execute.return_value = execute_result
        db.add = MagicMock()
        db.commit = MagicMock()
        return db

    def test_creates_new_dashboard_when_none_exists(self) -> None:
        """PUT /layout must call db.add when no dashboard row exists yet."""
        db = self._make_save_db(None)
        user = _make_user()
        layout = {"cols": 3, "grid": [{"widget_id": "w1", "row": 0, "col": 0}]}

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.put("/dashboard/layout", json={"layout": layout})

        assert response.status_code == 200
        db.add.assert_called_once()
        db.commit.assert_called_once()

    def test_updates_existing_dashboard_layout(self) -> None:
        """PUT /layout must update the existing dashboard's layout in place."""
        existing = MagicMock()
        existing.layout = {"cols": 3, "grid": []}

        db = self._make_save_db(existing)
        user = _make_user()
        new_layout = {"cols": 4, "grid": [{"widget_id": "w2", "row": 0, "col": 0}]}

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.put("/dashboard/layout", json={"layout": new_layout})

        assert response.status_code == 200
        assert existing.layout == new_layout
        db.commit.assert_called_once()

    def test_does_not_call_db_add_when_updating_existing(self) -> None:
        """PUT /layout on existing dashboard must NOT call db.add (update-only path)."""
        existing = MagicMock()
        existing.layout = {}

        db = self._make_save_db(existing)
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            client.put("/dashboard/layout", json={"layout": {"cols": 3, "grid": []}})

        db.add.assert_not_called()

    def test_response_body_contains_layout(self) -> None:
        """PUT /layout must return the saved layout in the response body."""
        db = self._make_save_db(None)
        user = _make_user()
        layout = {"cols": 2, "grid": []}

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.put("/dashboard/layout", json={"layout": layout})

        body = response.json()
        assert "layout" in body
        assert body["layout"] == layout

    def test_missing_layout_body_returns_422(self) -> None:
        """PUT /layout without a body must return 422 (Pydantic validation)."""
        db = self._make_save_db(None)
        user = _make_user()

        with patch("backend.routers.dashboard.set_rls_user"):
            client = _client_with_overrides(db, user)
            response = client.put("/dashboard/layout", json={})

        assert response.status_code == 422
