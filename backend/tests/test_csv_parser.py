"""Tests for backend.parsers.csv_parser — CSV statement parsing logic."""

from __future__ import annotations

import pytest

from backend.parsers.csv_parser import _find_column, parse_csv

# ---------------------------------------------------------------------------
# _find_column — column header detection
# ---------------------------------------------------------------------------


class TestFindColumn:
    """Tests for the _find_column helper function."""

    def test_finds_exact_match_case_insensitive(self):
        """Exact keyword match should be returned regardless of case."""
        columns = ["Date", "Description", "Amount"]
        result = _find_column(columns, ["date"])
        assert result == "Date"

    def test_finds_withdrawal_dr_as_debit(self):
        """Column header 'Withdrawal (Dr)' should match the 'withdrawal' keyword."""
        columns = ["Date", "Narration", "Withdrawal (Dr)", "Deposit (Cr)", "Balance"]
        from backend.parsers.csv_parser import _DEBIT_KEYWORDS

        result = _find_column(columns, _DEBIT_KEYWORDS)
        assert result == "Withdrawal (Dr)"

    def test_finds_deposit_cr_as_credit(self):
        """Column header 'Deposit (Cr)' should match the 'deposit' keyword."""
        columns = ["Date", "Narration", "Withdrawal (Dr)", "Deposit (Cr)", "Balance"]
        from backend.parsers.csv_parser import _CREDIT_KEYWORDS

        result = _find_column(columns, _CREDIT_KEYWORDS)
        assert result == "Deposit (Cr)"

    def test_returns_none_when_no_match(self):
        """Should return None when no keyword matches any column header."""
        columns = ["TransDate", "Memo", "Balance"]
        from backend.parsers.csv_parser import _AMOUNT_KEYWORDS

        result = _find_column(columns, _AMOUNT_KEYWORDS)
        assert result is None

    def test_prefers_exact_match_over_substring(self):
        """Exact keyword match should win over substring match."""
        # 'date' exact-matches 'Date'; 'Transaction Date' would be substring only
        columns = ["Transaction Date", "Date", "Description"]
        result = _find_column(columns, ["date"])
        assert result == "Date"

    def test_empty_columns_returns_none(self):
        """Empty column list should always return None."""
        result = _find_column([], ["date", "amount"])
        assert result is None

    def test_empty_keywords_returns_none(self):
        """Empty keyword list should always return None."""
        result = _find_column(["Date", "Amount"], [])
        assert result is None

    def test_case_insensitive_substring_match(self):
        """Substring match should be case-insensitive."""
        columns = ["TRANSACTION DATE", "DESCRIPTION", "AMOUNT"]
        result = _find_column(columns, ["date"])
        assert result == "TRANSACTION DATE"


# ---------------------------------------------------------------------------
# parse_csv — separate debit/credit columns
# ---------------------------------------------------------------------------


def _make_csv(header: str, *rows: str) -> bytes:
    """Build CSV bytes from a header line and data row strings."""
    lines = [header] + list(rows)
    return "\n".join(lines).encode("utf-8")


class TestParseCsvSplitColumns:
    """Tests for parse_csv when the CSV has separate debit and credit columns."""

    def test_split_columns_produce_debit_credit_keys(self):
        """Transactions from a split-column CSV must have 'debit' and 'credit' keys."""
        csv_bytes = _make_csv(
            "Date,Description,Withdrawal (Dr),Deposit (Cr)",
            "2024-01-10,Rent Payment,1200.00,",
            "2024-01-15,Salary,, 3000.00",
        )
        transactions = parse_csv(csv_bytes, bank_name="Test Bank")
        assert len(transactions) == 2
        for txn in transactions:
            assert "debit" in txn
            assert "credit" in txn
            assert "amount" not in txn

    def test_withdrawal_column_maps_to_debit(self):
        """A row with a value in 'Withdrawal (Dr)' column should have debit > 0."""
        csv_bytes = _make_csv(
            "Date,Description,Withdrawal (Dr),Deposit (Cr)",
            "2024-01-10,ATM Withdrawal,500.00,",
        )
        transactions = parse_csv(csv_bytes, bank_name="Test Bank")
        assert len(transactions) == 1
        assert transactions[0]["debit"] == 500.0
        assert transactions[0]["credit"] == 0.0

    def test_deposit_column_maps_to_credit(self):
        """A row with a value in 'Deposit (Cr)' column should have credit > 0."""
        csv_bytes = _make_csv(
            "Date,Description,Withdrawal (Dr),Deposit (Cr)",
            "2024-01-15,Direct Deposit,,2500.00",
        )
        transactions = parse_csv(csv_bytes, bank_name="Test Bank")
        assert len(transactions) == 1
        assert transactions[0]["credit"] == 2500.0
        assert transactions[0]["debit"] == 0.0

    def test_both_columns_in_same_row(self):
        """A row with both debit and credit values should preserve both as floats."""
        csv_bytes = _make_csv(
            "Date,Narration,Withdrawal (Dr),Deposit (Cr)",
            "2024-02-01,Correction Entry,100.00,100.00",
        )
        transactions = parse_csv(csv_bytes, bank_name="Test Bank")
        assert len(transactions) == 1
        assert transactions[0]["debit"] == 100.0
        assert transactions[0]["credit"] == 100.0

    def test_bank_name_stored_on_each_row(self):
        """bank_name from argument should appear on every transaction dict."""
        csv_bytes = _make_csv(
            "Date,Description,Withdrawal (Dr),Deposit (Cr)",
            "2024-01-10,Grocery,50.00,",
        )
        transactions = parse_csv(csv_bytes, bank_name="  HDFC  ")
        assert transactions[0]["bank_name"] == "HDFC"

    def test_empty_amount_cells_treated_as_zero(self):
        """Blank cells in split-column CSV should be treated as 0.0."""
        csv_bytes = _make_csv(
            "Date,Description,Withdrawal (Dr),Deposit (Cr)",
            "2024-01-10,Grocery,50.00,",
        )
        transactions = parse_csv(csv_bytes, bank_name="Test Bank")
        assert transactions[0]["debit"] == 50.0
        assert transactions[0]["credit"] == 0.0


# ---------------------------------------------------------------------------
# parse_csv — combined signed amount column
# ---------------------------------------------------------------------------


class TestParseCsvCombinedAmountColumn:
    """Tests for parse_csv when the CSV has a single signed amount column."""

    def test_negative_amount_becomes_debit(self):
        """Negative signed amount should map to debit (absolute value)."""
        csv_bytes = _make_csv(
            "Date,Description,Amount",
            "2024-01-10,Rent,-1200.00",
        )
        transactions = parse_csv(csv_bytes, bank_name="Test Bank")
        assert len(transactions) == 1
        assert transactions[0]["debit"] == 1200.0
        assert transactions[0]["credit"] == 0.0

    def test_positive_amount_becomes_credit(self):
        """Positive signed amount should map to credit."""
        csv_bytes = _make_csv(
            "Date,Description,Amount",
            "2024-01-15,Salary,3000.00",
        )
        transactions = parse_csv(csv_bytes, bank_name="Test Bank")
        assert len(transactions) == 1
        assert transactions[0]["credit"] == 3000.0
        assert transactions[0]["debit"] == 0.0

    def test_zero_amount_row_is_dropped(self):
        """Rows where both debit and credit resolve to zero should be omitted."""
        csv_bytes = _make_csv(
            "Date,Description,Amount",
            "2024-01-10,Zero Entry,0.00",
            "2024-01-11,Real Expense,-50.00",
        )
        transactions = parse_csv(csv_bytes, bank_name="Test Bank")
        assert len(transactions) == 1
        assert transactions[0]["description"] == "Real Expense"

    def test_output_dicts_have_no_amount_key(self):
        """Combined-amount CSV should still produce debit/credit keys, not amount."""
        csv_bytes = _make_csv(
            "Date,Description,Amount",
            "2024-01-10,Grocery,-45.00",
            "2024-01-15,Paycheck,2000.00",
        )
        transactions = parse_csv(csv_bytes, bank_name="Test Bank")
        for txn in transactions:
            assert "debit" in txn
            assert "credit" in txn
            assert "amount" not in txn

    def test_multiple_rows_split_correctly(self):
        """All rows in a combined-amount CSV should split correctly."""
        csv_bytes = _make_csv(
            "Date,Narration,Transaction Amount",
            "2024-01-01,Coffee,-4.50",
            "2024-01-02,Refund,10.00",
            "2024-01-03,Gym,-30.00",
        )
        transactions = parse_csv(csv_bytes, bank_name="Test Bank")
        assert len(transactions) == 3
        debits = [t["debit"] for t in transactions]
        credits = [t["credit"] for t in transactions]
        assert debits == [4.5, 0.0, 30.0]
        assert credits == [0.0, 10.0, 0.0]


# ---------------------------------------------------------------------------
# parse_csv — error handling
# ---------------------------------------------------------------------------


class TestParseCsvErrors:
    """Tests for parse_csv error conditions."""

    def test_missing_date_column_raises_value_error(self):
        """CSV with no recognisable date column should raise ValueError."""
        csv_bytes = _make_csv(
            "Memo,Amount",
            "Rent,-1200.00",
        )
        with pytest.raises(ValueError, match="date column"):
            parse_csv(csv_bytes, bank_name="Test Bank")

    def test_missing_description_column_raises_value_error(self):
        """CSV with no recognisable description column should raise ValueError."""
        csv_bytes = _make_csv(
            "Date,Amount",
            "2024-01-10,-1200.00",
        )
        with pytest.raises(ValueError, match="description column"):
            parse_csv(csv_bytes, bank_name="Test Bank")

    def test_missing_amount_column_raises_value_error(self):
        """CSV with no amount column at all should raise ValueError."""
        csv_bytes = _make_csv(
            "Date,Description,Balance",
            "2024-01-10,Grocery,5000.00",
        )
        with pytest.raises(ValueError, match="amount column"):
            parse_csv(csv_bytes, bank_name="Test Bank")

    def test_empty_bytes_raises(self):
        """Empty bytes input should raise (CSV parse failure)."""
        with pytest.raises(Exception):
            parse_csv(b"", bank_name="Test Bank")

    def test_category_is_always_none(self):
        """category field must always be None from the parser."""
        csv_bytes = _make_csv(
            "Date,Description,Amount",
            "2024-01-10,Grocery,-45.00",
        )
        transactions = parse_csv(csv_bytes, bank_name="Test Bank")
        assert transactions[0]["category"] is None
