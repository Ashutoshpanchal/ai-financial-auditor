"""Tests for ``backend.services.category_rules_apply``."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from backend.models.category_rule import CategoryRule
from backend.services.category_rules_apply import (
    apply_category_rules_to_transactions,
    description_matches_rule,
    resolve_category_master_id,
)


def test_description_matches_rule_exact() -> None:
    """Exact match is case-insensitive."""
    rule = MagicMock(spec=CategoryRule)
    rule.pattern = "Foo BAR"
    rule.match_type = "exact"
    assert description_matches_rule("foo bar", rule) is True
    assert description_matches_rule("foo baz", rule) is False


def test_description_matches_rule_contains() -> None:
    """Contains match is case-insensitive substring."""
    rule = MagicMock(spec=CategoryRule)
    rule.pattern = "Swiggy"
    rule.match_type = "contains"
    assert description_matches_rule("UPI Swiggy Ltd", rule) is True


def test_resolve_category_master_id_prefers_user_row() -> None:
    """User-owned CM wins over global for same parent/sub."""
    user_row = MagicMock()
    user_row.id = "cm-user"
    user_row.user_id = "u1"
    global_row = MagicMock()
    global_row.id = "cm-global"
    global_row.user_id = None

    db = MagicMock()
    db.execute.return_value.scalars.return_value.all.return_value = [
        global_row,
        user_row,
    ]

    assert resolve_category_master_id(db, "u1", "Food", "Swiggy") == "cm-user"


def test_apply_category_rules_updates_transaction() -> None:
    """First matching enabled rule updates txn fields."""
    rule = MagicMock(spec=CategoryRule)
    rule.id = "r1"
    rule.pattern = "exact text"
    rule.match_type = "exact"
    rule.parent_category = "Food & Dining"
    rule.sub_category = "Zomato"
    rule.priority = 0
    rule.created_at = None

    txn = MagicMock(
        spec=[
            "description",
            "category_master_id",
            "parent_category",
            "sub_category",
            "category",
        ]
    )
    txn.description = "Exact Text"
    txn.category_master_id = None

    db = MagicMock()
    db.execute.return_value.scalars.return_value.all.return_value = [rule]
    mock_query = MagicMock()
    db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.all.return_value = [txn]

    with patch(
        "backend.services.category_rules_apply.resolve_category_master_id",
        return_value="cm-99",
    ):
        n = apply_category_rules_to_transactions(db, "u1", None)

    assert n == 1
    assert txn.parent_category == "Food & Dining"
    assert txn.sub_category == "Zomato"
    assert txn.category == "Food & Dining / Zomato"
    assert txn.category_master_id == "cm-99"
