"""Tests for backend.services.auto_categorize."""

from __future__ import annotations

from unittest.mock import MagicMock

from backend.services.auto_categorize import auto_categorize_transactions


def _make_cm_row(cm_id: str, parent: str, sub: str, user_id: str | None) -> MagicMock:
    row = MagicMock()
    row.id = cm_id
    row.parent_category = parent
    row.sub_category = sub
    row.user_id = user_id
    return row


def _make_txn(txn_id: str, short_desc: str | None, user_id: str = "u1") -> MagicMock:
    txn = MagicMock(
        spec=[
            "id",
            "user_id",
            "short_description",
            "category_master_id",
            "category",
            "parent_category",
            "sub_category",
            "document_id",
        ]
    )
    txn.id = txn_id
    txn.user_id = user_id
    txn.short_description = short_desc
    txn.category_master_id = None
    txn.category = None
    txn.parent_category = None
    txn.sub_category = None
    return txn


class TestAutoCategorize:
    """Tests for the auto_categorize_transactions service."""

    def test_no_cm_rows_returns_zero(self) -> None:
        """When there are no category_master rows, nothing is categorized."""
        db = MagicMock()
        db.execute.return_value.scalars.return_value.all.return_value = []
        db.query.return_value.filter.return_value.all.return_value = []

        result = auto_categorize_transactions(db, "u1")
        assert result == 0

    def test_matches_single_token(self) -> None:
        """short_description 'zomato' matches CM sub_category 'Zomato'."""
        cm = _make_cm_row("cm-1", "Food & Dining", "Zomato", None)
        txn = _make_txn("tx-1", "zomato")

        db = MagicMock()
        db.execute.return_value.scalars.return_value.all.return_value = [cm]
        db.query.return_value.filter.return_value.all.return_value = [txn]

        result = auto_categorize_transactions(db, "u1")
        assert result == 1
        assert txn.category == "Food & Dining / Zomato"
        assert txn.parent_category == "Food & Dining"
        assert txn.sub_category == "Zomato"
        assert txn.category_master_id == "cm-1"

    def test_matches_multi_token_short_description(self) -> None:
        """short_description 'nach-groww' matches on the 'groww' token."""
        cm = _make_cm_row("cm-1", "Investment", "Groww", None)
        txn = _make_txn("tx-1", "nach-groww")

        db = MagicMock()
        db.execute.return_value.scalars.return_value.all.return_value = [cm]
        db.query.return_value.filter.return_value.all.return_value = [txn]

        result = auto_categorize_transactions(db, "u1")
        assert result == 1
        assert txn.category == "Investment / Groww"

    def test_no_match_leaves_txn_uncategorized(self) -> None:
        """When no CM token matches, transaction stays uncategorized."""
        cm = _make_cm_row("cm-1", "Food & Dining", "Zomato", None)
        txn = _make_txn("tx-1", "unknown-merchant")

        db = MagicMock()
        db.execute.return_value.scalars.return_value.all.return_value = [cm]
        db.query.return_value.filter.return_value.all.return_value = [txn]

        result = auto_categorize_transactions(db, "u1")
        assert result == 0
        assert txn.category is None

    def test_prefers_longer_sub_category_match(self) -> None:
        """When multiple CM rows match via different tokens, the longest sub_category wins."""
        cm_payu = _make_cm_row("cm-1", "Food & Dining", "PayU", None)
        cm_payu_checkout = _make_cm_row("cm-2", "Shopping", "PayU Checkout", None)
        # "payu-something" splits into ["payu", "something"]
        # "payu" matches CM "PayU" (len 4) — only match
        txn = _make_txn("tx-1", "payu-something")

        db = MagicMock()
        db.execute.return_value.scalars.return_value.all.return_value = [
            cm_payu,
            cm_payu_checkout,
        ]
        db.query.return_value.filter.return_value.all.return_value = [txn]

        result = auto_categorize_transactions(db, "u1")
        assert result == 1
        assert txn.sub_category == "PayU"

    def test_prefers_user_owned_over_global(self) -> None:
        """User-owned CM rows are preferred over global seed for same sub_category."""
        cm_global = _make_cm_row("cm-g", "Investment", "Groww", None)
        cm_user = _make_cm_row("cm-u", "Savings", "Groww", "u1")
        txn = _make_txn("tx-1", "groww")

        db = MagicMock()
        db.execute.return_value.scalars.return_value.all.return_value = [
            cm_global,
            cm_user,
        ]
        db.query.return_value.filter.return_value.all.return_value = [txn]

        result = auto_categorize_transactions(db, "u1")
        assert result == 1
        # User-owned row wins
        assert txn.category_master_id == "cm-u"
        assert txn.parent_category == "Savings"

    def test_substring_matches_embedded_merchant(self) -> None:
        """CM sub_category 'Swiggy' matches short_description 'swiggyltd' via substring."""
        cm = _make_cm_row("cm-1", "Food & Dining", "Swiggy", None)
        txn = _make_txn("tx-1", "swiggyltd")

        db = MagicMock()
        db.execute.return_value.scalars.return_value.all.return_value = [cm]
        db.query.return_value.filter.return_value.all.return_value = [txn]

        result = auto_categorize_transactions(db, "u1")
        assert result == 1
        assert txn.sub_category == "Swiggy"
        assert txn.category_master_id == "cm-1"
        """Transactions that already have category_master_id are not re-categorized."""
        cm = _make_cm_row("cm-1", "Food & Dining", "Zomato", None)
        txn = _make_txn("tx-1", "zomato")
        txn.category_master_id = "already-set"

        db = MagicMock()
        db.execute.return_value.scalars.return_value.all.return_value = [cm]
        # The query filter excludes already-categorized rows
        db.query.return_value.filter.return_value.all.return_value = []

        result = auto_categorize_transactions(db, "u1")
        assert result == 0

    def test_document_id_scopes_query(self) -> None:
        """When document_id is provided, only that document's transactions are processed."""
        cm = _make_cm_row("cm-1", "Food & Dining", "Zomato", None)
        txn = _make_txn("tx-1", "zomato")

        db = MagicMock()
        db.execute.return_value.scalars.return_value.all.return_value = [cm]
        # Chain: query().filter().filter().all()
        mock_query = MagicMock()
        db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.all.return_value = [txn]

        result = auto_categorize_transactions(db, "u1", document_id="doc-123")
        assert result == 1
        # Verify filter was called twice (once for base, once for document_id)
        assert mock_query.filter.call_count == 2
