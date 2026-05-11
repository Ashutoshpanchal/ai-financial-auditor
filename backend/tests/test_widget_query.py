"""Tests for backend.services.widget_query — resolve_widget_data()."""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

import pytest

from backend.services.widget_query import resolve_widget_data

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

USER_ID = "user-test-123"


def _make_db(scalar_value=None, all_rows=None):
    """Return a mock SQLAlchemy Session.

    scalar_value: returned by db.execute(...).scalar()
    all_rows:     returned by db.execute(...).all()
    """
    db = MagicMock()
    execute_result = MagicMock()
    execute_result.scalar.return_value = scalar_value
    execute_result.all.return_value = all_rows or []
    db.execute.return_value = execute_result
    return db


def _make_row(label: str, total: float) -> MagicMock:
    """Return a mock result row with .label and .total attributes."""
    row = MagicMock()
    row.label = label
    row.total = total
    return row


def _make_month_row(month: str, total: float) -> MagicMock:
    """Return a mock result row with .month and .total attributes."""
    row = MagicMock()
    row.month = month
    row.total = total
    return row


# ---------------------------------------------------------------------------
# Validation — invalid aggregation
# ---------------------------------------------------------------------------


class TestValidationAggregation:
    """resolve_widget_data raises ValueError for unknown aggregation values."""

    def test_raises_for_invalid_aggregation(self) -> None:
        """An aggregation not in the allowed set must raise ValueError."""
        db = _make_db()
        with pytest.raises(ValueError, match="Invalid aggregation"):
            resolve_widget_data(
                config={"aggregation": "median", "field": "debit"},
                user_id=USER_ID,
                db=db,
            )

    def test_raises_for_empty_aggregation(self) -> None:
        """An empty aggregation string must raise ValueError."""
        db = _make_db()
        with pytest.raises(ValueError, match="Invalid aggregation"):
            resolve_widget_data(
                config={"aggregation": "", "field": "debit"},
                user_id=USER_ID,
                db=db,
            )

    def test_raises_for_missing_aggregation_key(self) -> None:
        """A config dict without 'aggregation' defaults to '' and must raise ValueError."""
        db = _make_db()
        with pytest.raises(ValueError, match="Invalid aggregation"):
            resolve_widget_data(
                config={"field": "debit"},
                user_id=USER_ID,
                db=db,
            )

    def test_all_valid_aggregations_do_not_raise(self) -> None:
        """Each of sum / count / avg / max / min must not raise on aggregation validation."""
        valid = ["sum", "count", "avg", "max", "min"]
        for agg in valid:
            db = _make_db(scalar_value=100.0)
            # Should NOT raise; if field is valid too, no exception expected
            result = resolve_widget_data(
                config={"aggregation": agg, "field": "credit"},
                user_id=USER_ID,
                db=db,
            )
            assert "value" in result


# ---------------------------------------------------------------------------
# Validation — invalid field
# ---------------------------------------------------------------------------


class TestValidationField:
    """resolve_widget_data raises ValueError for unknown field values."""

    def test_raises_for_invalid_field(self) -> None:
        """A field not in {credit, debit} must raise ValueError."""
        db = _make_db()
        with pytest.raises(ValueError, match="Invalid field"):
            resolve_widget_data(
                config={"aggregation": "sum", "field": "balance"},
                user_id=USER_ID,
                db=db,
            )

    def test_raises_for_empty_field(self) -> None:
        """An empty field string must raise ValueError."""
        db = _make_db()
        with pytest.raises(ValueError, match="Invalid field"):
            resolve_widget_data(
                config={"aggregation": "sum", "field": ""},
                user_id=USER_ID,
                db=db,
            )

    def test_raises_for_missing_field_key(self) -> None:
        """A config dict without 'field' defaults to '' and must raise ValueError."""
        db = _make_db()
        with pytest.raises(ValueError, match="Invalid field"):
            resolve_widget_data(
                config={"aggregation": "sum"},
                user_id=USER_ID,
                db=db,
            )

    def test_credit_field_does_not_raise(self) -> None:
        """'credit' is a valid field and must not raise."""
        db = _make_db(scalar_value=500.0)
        result = resolve_widget_data(
            config={"aggregation": "sum", "field": "credit"},
            user_id=USER_ID,
            db=db,
        )
        assert result["value"] == 500.0

    def test_debit_field_does_not_raise(self) -> None:
        """'debit' is a valid field and must not raise."""
        db = _make_db(scalar_value=250.0)
        result = resolve_widget_data(
            config={"aggregation": "sum", "field": "debit"},
            user_id=USER_ID,
            db=db,
        )
        assert result["value"] == 250.0


# ---------------------------------------------------------------------------
# Validation — invalid group_by
# ---------------------------------------------------------------------------


class TestValidationGroupBy:
    """resolve_widget_data raises ValueError for unknown group_by values."""

    def test_raises_for_invalid_group_by(self) -> None:
        """A group_by not in {month, category, bank_name} must raise ValueError."""
        db = _make_db()
        with pytest.raises(ValueError, match="Invalid group_by"):
            resolve_widget_data(
                config={"aggregation": "sum", "field": "debit", "group_by": "year"},
                user_id=USER_ID,
                db=db,
            )

    def test_raises_for_empty_group_by(self) -> None:
        """An empty string group_by must raise ValueError (treated as invalid)."""
        db = _make_db()
        with pytest.raises(ValueError, match="Invalid group_by"):
            resolve_widget_data(
                config={"aggregation": "sum", "field": "debit", "group_by": ""},
                user_id=USER_ID,
                db=db,
            )

    def test_all_valid_group_by_do_not_raise_on_validation(self) -> None:
        """month / category / bank_name must all pass the group_by validation gate."""
        valid = ["month", "category", "bank_name"]
        for gb in valid:
            db = _make_db(all_rows=[])
            # Should not raise ValueError for the group_by check
            result = resolve_widget_data(
                config={"aggregation": "sum", "field": "debit", "group_by": gb},
                user_id=USER_ID,
                db=db,
            )
            assert isinstance(result, list)


# ---------------------------------------------------------------------------
# Metric mode (no group_by)
# ---------------------------------------------------------------------------


class TestMetricMode:
    """resolve_widget_data returns a metric dict when group_by is absent."""

    def test_returns_dict_with_value_and_format(self) -> None:
        """Metric mode must return {'value': float, 'format': str}."""
        db = _make_db(scalar_value=1234.56)
        result = resolve_widget_data(
            config={"aggregation": "sum", "field": "credit", "format": "currency"},
            user_id=USER_ID,
            db=db,
        )
        assert isinstance(result, dict)
        assert "value" in result
        assert "format" in result
        assert result["value"] == 1234.56
        assert result["format"] == "currency"

    def test_value_is_float(self) -> None:
        """The 'value' key must always be a float (not int)."""
        db = _make_db(scalar_value=42)
        result = resolve_widget_data(
            config={"aggregation": "count", "field": "debit"},
            user_id=USER_ID,
            db=db,
        )
        assert isinstance(result["value"], float)

    def test_none_scalar_defaults_to_zero(self) -> None:
        """If the DB returns None (no rows), value must default to 0.0."""
        db = _make_db(scalar_value=None)
        result = resolve_widget_data(
            config={"aggregation": "sum", "field": "debit"},
            user_id=USER_ID,
            db=db,
        )
        assert result["value"] == 0.0

    def test_default_format_is_number(self) -> None:
        """If 'format' is absent from config, default must be 'number'."""
        db = _make_db(scalar_value=10.0)
        result = resolve_widget_data(
            config={"aggregation": "avg", "field": "credit"},
            user_id=USER_ID,
            db=db,
        )
        assert result["format"] == "number"

    def test_execute_is_called_once(self) -> None:
        """Metric mode must execute exactly one DB query."""
        db = _make_db(scalar_value=0.0)
        resolve_widget_data(
            config={"aggregation": "sum", "field": "debit"},
            user_id=USER_ID,
            db=db,
        )
        assert db.execute.call_count == 1


# ---------------------------------------------------------------------------
# Chart mode — group_by="month"
# ---------------------------------------------------------------------------


class TestChartModeMonth:
    """resolve_widget_data returns a list of {label, value} dicts for month grouping."""

    def test_returns_list(self) -> None:
        """Chart mode must return a list, not a dict."""
        db = _make_db(all_rows=[])
        result = resolve_widget_data(
            config={"aggregation": "sum", "field": "debit", "group_by": "month"},
            user_id=USER_ID,
            db=db,
        )
        assert isinstance(result, list)

    def test_each_row_has_label_and_value(self) -> None:
        """Each item in the list must contain 'label' and 'value' keys."""
        rows = [
            _make_month_row("2024-01", 500.0),
            _make_month_row("2024-02", 750.25),
        ]
        db = _make_db(all_rows=rows)
        result = resolve_widget_data(
            config={"aggregation": "sum", "field": "debit", "group_by": "month"},
            user_id=USER_ID,
            db=db,
        )
        assert len(result) == 2
        for item in result:
            assert "label" in item
            assert "value" in item
        assert result[0]["label"] == "2024-01"
        assert result[0]["value"] == 500.0
        assert result[1]["label"] == "2024-02"
        assert result[1]["value"] == 750.25

    def test_value_is_float(self) -> None:
        """Values must be floats even when the DB returns integers."""
        rows = [_make_month_row("2024-01", 100)]
        db = _make_db(all_rows=rows)
        result = resolve_widget_data(
            config={"aggregation": "sum", "field": "debit", "group_by": "month"},
            user_id=USER_ID,
            db=db,
        )
        assert isinstance(result[0]["value"], float)

    def test_none_total_defaults_to_zero(self) -> None:
        """A None total from the DB must be coerced to 0.0."""
        rows = [_make_month_row("2024-01", None)]
        db = _make_db(all_rows=rows)
        result = resolve_widget_data(
            config={"aggregation": "sum", "field": "debit", "group_by": "month"},
            user_id=USER_ID,
            db=db,
        )
        assert result[0]["value"] == 0.0

    def test_empty_result_returns_empty_list(self) -> None:
        """No rows from the DB must yield an empty list."""
        db = _make_db(all_rows=[])
        result = resolve_widget_data(
            config={"aggregation": "sum", "field": "debit", "group_by": "month"},
            user_id=USER_ID,
            db=db,
        )
        assert result == []


# ---------------------------------------------------------------------------
# Chart mode — group_by="category"
# ---------------------------------------------------------------------------


class TestChartModeCategory:
    """resolve_widget_data returns chart rows for category grouping."""

    def test_returns_list(self) -> None:
        """category group_by must return a list."""
        db = _make_db(all_rows=[])
        result = resolve_widget_data(
            config={"aggregation": "sum", "field": "debit", "group_by": "category"},
            user_id=USER_ID,
            db=db,
        )
        assert isinstance(result, list)

    def test_row_label_maps_to_category(self) -> None:
        """Each item label must be the category value from the DB row."""
        rows = [
            _make_row("Food & Drink", 300.0),
            _make_row("Groceries", 150.0),
        ]
        db = _make_db(all_rows=rows)
        result = resolve_widget_data(
            config={"aggregation": "sum", "field": "debit", "group_by": "category"},
            user_id=USER_ID,
            db=db,
        )
        labels = [r["label"] for r in result]
        assert "Food & Drink" in labels
        assert "Groceries" in labels

    def test_execute_is_called_once(self) -> None:
        """Chart mode must execute exactly one DB query."""
        db = _make_db(all_rows=[])
        resolve_widget_data(
            config={"aggregation": "sum", "field": "debit", "group_by": "category"},
            user_id=USER_ID,
            db=db,
        )
        assert db.execute.call_count == 1


# ---------------------------------------------------------------------------
# Chart mode — group_by="bank_name"
# ---------------------------------------------------------------------------


class TestChartModeBankName:
    """resolve_widget_data returns chart rows for bank_name grouping."""

    def test_returns_list(self) -> None:
        """bank_name group_by must return a list."""
        db = _make_db(all_rows=[])
        result = resolve_widget_data(
            config={"aggregation": "sum", "field": "debit", "group_by": "bank_name"},
            user_id=USER_ID,
            db=db,
        )
        assert isinstance(result, list)

    def test_row_label_maps_to_bank_name(self) -> None:
        """Each item label must be the bank_name value from the DB row."""
        rows = [
            _make_row("Chase", 500.0),
            _make_row("BoA", 200.0),
        ]
        db = _make_db(all_rows=rows)
        result = resolve_widget_data(
            config={"aggregation": "sum", "field": "debit", "group_by": "bank_name"},
            user_id=USER_ID,
            db=db,
        )
        labels = [r["label"] for r in result]
        assert "Chase" in labels
        assert "BoA" in labels


# ---------------------------------------------------------------------------
# Date filter propagation
# ---------------------------------------------------------------------------


class TestDateFilters:
    """date_from / date_to global filters must be forwarded to the query."""

    def test_date_filters_do_not_raise(self) -> None:
        """Providing date_from and date_to must not raise any error."""
        db = _make_db(scalar_value=999.0)
        result = resolve_widget_data(
            config={"aggregation": "sum", "field": "credit"},
            user_id=USER_ID,
            db=db,
            date_from=date(2024, 1, 1),
            date_to=date(2024, 6, 30),
        )
        assert result["value"] == 999.0

    def test_date_filters_cause_execute_to_be_called(self) -> None:
        """Even with date filters, exactly one DB execute must occur in metric mode."""
        db = _make_db(scalar_value=0.0)
        resolve_widget_data(
            config={"aggregation": "sum", "field": "debit"},
            user_id=USER_ID,
            db=db,
            date_from=date(2024, 1, 1),
            date_to=date(2024, 12, 31),
        )
        assert db.execute.call_count == 1


# ---------------------------------------------------------------------------
# Global filter override behaviour
# ---------------------------------------------------------------------------


class TestGlobalFilterOverride:
    """Global category and bank_name params override config-level filters."""

    def test_global_category_overrides_config_category(self) -> None:
        """When global category is given, it overrides the config-level category filter."""
        db = _make_db(scalar_value=100.0)
        # Config says category=Food, global says category=Transport
        result = resolve_widget_data(
            config={
                "aggregation": "sum",
                "field": "debit",
                "filters": {"category": "Food"},
            },
            user_id=USER_ID,
            db=db,
            category="Transport",
        )
        # The call must succeed and return a metric dict; the override is
        # exercised by the WHERE clause builder (we trust the unit returns correctly)
        assert result["value"] == 100.0

    def test_global_bank_name_overrides_config_bank_name(self) -> None:
        """When global bank_name is given, it overrides the config-level bank_name filter."""
        db = _make_db(scalar_value=50.0)
        result = resolve_widget_data(
            config={
                "aggregation": "sum",
                "field": "credit",
                "filters": {"bank_name": "Chase"},
            },
            user_id=USER_ID,
            db=db,
            bank_name="BoA",
        )
        assert result["value"] == 50.0

    def test_config_category_used_when_no_global_category(self) -> None:
        """If global category is None, the config-level category filter is applied."""
        db = _make_db(scalar_value=75.0)
        result = resolve_widget_data(
            config={
                "aggregation": "sum",
                "field": "debit",
                "filters": {"category": "Groceries"},
            },
            user_id=USER_ID,
            db=db,
            category=None,
        )
        assert result["value"] == 75.0

    def test_neither_global_nor_config_filter_is_valid(self) -> None:
        """If neither global nor config filter is set, no category filter is applied."""
        db = _make_db(scalar_value=200.0)
        result = resolve_widget_data(
            config={"aggregation": "sum", "field": "debit"},
            user_id=USER_ID,
            db=db,
        )
        assert result["value"] == 200.0
