"""Tests for backend.services.dashboard_service.

Covers:
- is_dashboard_bootstrapped: returns False when count == 0, True when count > 0
- bootstrap_default_dashboard: no-op if already bootstrapped
- bootstrap_default_dashboard: creates widgets + layout on first call
- bootstrap_default_dashboard: rolls back and re-raises on DB error
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from backend.services.dashboard_service import (
    bootstrap_default_dashboard,
    is_dashboard_bootstrapped,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

USER_ID = "user-dashboard-test"


def _make_db_with_count(count: int | None) -> MagicMock:
    """Return a mock Session whose execute(...).scalar() returns *count*.

    Used to drive is_dashboard_bootstrapped.
    """
    db = MagicMock()
    execute_result = MagicMock()
    execute_result.scalar.return_value = count
    db.execute.return_value = execute_result
    return db


# ---------------------------------------------------------------------------
# is_dashboard_bootstrapped
# ---------------------------------------------------------------------------


class TestIsDashboardBootstrapped:
    """Unit tests for is_dashboard_bootstrapped."""

    def test_returns_false_when_count_is_zero(self) -> None:
        """No default widgets → not bootstrapped → must return False."""
        db = _make_db_with_count(0)
        result = is_dashboard_bootstrapped(USER_ID, db)
        assert result is False

    def test_returns_true_when_count_is_one(self) -> None:
        """One default widget row → bootstrapped → must return True."""
        db = _make_db_with_count(1)
        result = is_dashboard_bootstrapped(USER_ID, db)
        assert result is True

    def test_returns_true_when_count_is_many(self) -> None:
        """Multiple default widget rows → bootstrapped → must return True."""
        db = _make_db_with_count(5)
        result = is_dashboard_bootstrapped(USER_ID, db)
        assert result is True

    def test_returns_false_when_scalar_returns_none(self) -> None:
        """If the DB returns None (unexpected), must treat as 0 → False."""
        db = _make_db_with_count(None)
        result = is_dashboard_bootstrapped(USER_ID, db)
        assert result is False

    def test_calls_db_execute_once(self) -> None:
        """Exactly one DB execute must occur per call."""
        db = _make_db_with_count(0)
        is_dashboard_bootstrapped(USER_ID, db)
        assert db.execute.call_count == 1


# ---------------------------------------------------------------------------
# bootstrap_default_dashboard — no-op when already bootstrapped
# ---------------------------------------------------------------------------


class TestBootstrapDefaultDashboardNoop:
    """bootstrap_default_dashboard must be a no-op when already bootstrapped."""

    def test_noop_when_already_bootstrapped(self) -> None:
        """If is_dashboard_bootstrapped returns True, nothing must be added or committed."""
        db = _make_db_with_count(3)  # > 0 → already bootstrapped
        bootstrap_default_dashboard(USER_ID, db)
        db.add.assert_not_called()
        db.add_all.assert_not_called()
        db.commit.assert_not_called()

    def test_noop_does_not_raise(self) -> None:
        """The no-op path must not raise any exception."""
        db = _make_db_with_count(1)
        bootstrap_default_dashboard(USER_ID, db)  # must not raise


# ---------------------------------------------------------------------------
# bootstrap_default_dashboard — first-time bootstrap
# ---------------------------------------------------------------------------


class TestBootstrapDefaultDashboardFirstTime:
    """bootstrap_default_dashboard creates widgets + layout on first call."""

    def _make_fresh_db(self) -> MagicMock:
        """Return a mock DB that signals 'not yet bootstrapped' (count=0)."""
        db = MagicMock()

        # First execute call: is_dashboard_bootstrapped check → scalar returns 0
        execute_result = MagicMock()
        execute_result.scalar.return_value = 0
        db.execute.return_value = execute_result

        db.add_all = MagicMock()
        db.add = MagicMock()
        db.commit = MagicMock()
        db.rollback = MagicMock()
        return db

    def test_calls_add_all_with_widget_list(self) -> None:
        """db.add_all must be called once with the list of UserWidget objects."""
        from backend.default_dashboard_config import DEFAULT_WIDGETS

        db = self._make_fresh_db()
        bootstrap_default_dashboard(USER_ID, db)

        db.add_all.assert_called_once()
        widgets_added = db.add_all.call_args[0][0]
        assert len(widgets_added) == len(DEFAULT_WIDGETS)

    def test_calls_add_with_user_dashboard(self) -> None:
        """db.add must be called once with a UserDashboard object."""
        from backend.models.dashboard import UserDashboard

        db = self._make_fresh_db()
        bootstrap_default_dashboard(USER_ID, db)

        db.add.assert_called_once()
        dashboard_arg = db.add.call_args[0][0]
        assert isinstance(dashboard_arg, UserDashboard)

    def test_commits_transaction(self) -> None:
        """db.commit must be called exactly once after widgets and layout are added."""
        db = self._make_fresh_db()
        bootstrap_default_dashboard(USER_ID, db)
        db.commit.assert_called_once()

    def test_widget_user_id_matches_given_user(self) -> None:
        """Every created widget must belong to the given user_id."""
        db = self._make_fresh_db()
        bootstrap_default_dashboard(USER_ID, db)

        widgets_added = db.add_all.call_args[0][0]
        for widget in widgets_added:
            assert widget.user_id == USER_ID

    def test_widget_is_default_true(self) -> None:
        """Every bootstrapped widget must have is_default=True."""
        db = self._make_fresh_db()
        bootstrap_default_dashboard(USER_ID, db)

        widgets_added = db.add_all.call_args[0][0]
        for widget in widgets_added:
            assert widget.is_default is True

    def test_dashboard_layout_grid_has_correct_length(self) -> None:
        """The resolved layout grid must have the same number of entries as DEFAULT_LAYOUT."""
        from backend.default_dashboard_config import DEFAULT_LAYOUT

        db = self._make_fresh_db()
        bootstrap_default_dashboard(USER_ID, db)

        dashboard_arg = db.add.call_args[0][0]
        grid = dashboard_arg.layout["grid"]
        assert len(grid) == len(DEFAULT_LAYOUT["grid"])

    def test_layout_grid_entries_have_widget_id_not_widget_index(self) -> None:
        """Resolved grid entries must contain widget_id, not widget_index."""
        db = self._make_fresh_db()
        bootstrap_default_dashboard(USER_ID, db)

        dashboard_arg = db.add.call_args[0][0]
        grid = dashboard_arg.layout["grid"]
        for entry in grid:
            assert "widget_id" in entry
            assert "widget_index" not in entry

    def test_dashboard_user_id_matches_given_user(self) -> None:
        """The created UserDashboard must belong to the given user_id."""
        db = self._make_fresh_db()
        bootstrap_default_dashboard(USER_ID, db)

        dashboard_arg = db.add.call_args[0][0]
        assert dashboard_arg.user_id == USER_ID

    def test_widget_ids_in_layout_match_created_widgets(self) -> None:
        """Every widget_id in the layout grid must match an id from the created widgets."""
        db = self._make_fresh_db()
        bootstrap_default_dashboard(USER_ID, db)

        widgets_added = db.add_all.call_args[0][0]
        created_ids = {w.id for w in widgets_added}

        dashboard_arg = db.add.call_args[0][0]
        grid = dashboard_arg.layout["grid"]
        for entry in grid:
            assert entry["widget_id"] in created_ids


# ---------------------------------------------------------------------------
# bootstrap_default_dashboard — rollback on DB error
# ---------------------------------------------------------------------------


class TestBootstrapDefaultDashboardRollback:
    """bootstrap_default_dashboard rolls back and re-raises when the DB throws."""

    def _make_failing_db(self) -> MagicMock:
        """Return a mock DB that is not bootstrapped but fails on commit."""
        db = MagicMock()

        # is_dashboard_bootstrapped check → count = 0
        execute_result = MagicMock()
        execute_result.scalar.return_value = 0
        db.execute.return_value = execute_result

        db.add_all = MagicMock()
        db.add = MagicMock()
        db.commit = MagicMock(side_effect=RuntimeError("DB commit failed"))
        db.rollback = MagicMock()
        return db

    def test_rolls_back_on_commit_error(self) -> None:
        """db.rollback must be called when db.commit raises."""
        db = self._make_failing_db()

        with pytest.raises(RuntimeError, match="DB commit failed"):
            bootstrap_default_dashboard(USER_ID, db)

        db.rollback.assert_called_once()

    def test_re_raises_original_exception(self) -> None:
        """The original exception must propagate to the caller."""
        db = self._make_failing_db()

        with pytest.raises(RuntimeError, match="DB commit failed"):
            bootstrap_default_dashboard(USER_ID, db)

    def _make_failing_add_all_db(self) -> MagicMock:
        """Return a mock DB that fails on add_all (before commit)."""
        db = MagicMock()

        execute_result = MagicMock()
        execute_result.scalar.return_value = 0
        db.execute.return_value = execute_result

        db.add_all = MagicMock(side_effect=RuntimeError("add_all failed"))
        db.add = MagicMock()
        db.commit = MagicMock()
        db.rollback = MagicMock()
        return db

    def test_rolls_back_on_add_all_error(self) -> None:
        """db.rollback must be called even when the error occurs before commit."""
        db = self._make_failing_add_all_db()

        with pytest.raises(RuntimeError, match="add_all failed"):
            bootstrap_default_dashboard(USER_ID, db)

        db.rollback.assert_called_once()
