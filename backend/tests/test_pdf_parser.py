"""Tests for backend.parsers.pdf_parser amount parsing helpers."""

from backend.parsers.pdf_parser import _extract_from_tables, _parse_amount


class TestParseAmount:
    """Unit tests for robust amount parsing from PDF cell text."""

    def test_parse_rupee_with_commas(self) -> None:
        """Rupee-prefixed values should parse as floats."""
        assert _parse_amount("₹ 5,000.00") == 5000.0

    def test_parse_rupee_with_nbsp(self) -> None:
        """NBSP-separated rupee values should parse as floats."""
        assert _parse_amount("₹\u00a05,000.00") == 5000.0

    def test_parse_with_dr_suffix(self) -> None:
        """Debit suffix token should be ignored during parsing."""
        assert _parse_amount("5,000.00 Dr") == 5000.0

    def test_parse_empty_returns_none(self) -> None:
        """Empty amount text should not parse."""
        assert _parse_amount("") is None

    def test_parse_invalid_returns_none(self) -> None:
        """Malformed amount text should not parse."""
        assert _parse_amount("abc xyz") is None


class _FakePage:
    """Minimal fake pdfplumber page for table extraction tests."""

    def __init__(self, table: list[list[str]]) -> None:
        self._table = table

    def extract_tables(self) -> list[list[list[str]]]:
        return [self._table]


class _FakePdf:
    """Minimal fake pdfplumber PDF container."""

    def __init__(self, table: list[list[str]]) -> None:
        self.pages = [_FakePage(table)]


class TestExtractFromTables:
    """Regression tests for table-based debit/credit extraction."""

    def test_extract_with_sr_no_and_balance_columns(self) -> None:
        """Debit must come from Debit column, not from trailing Balance."""
        table = [
            ["Sr No", "Date", "Remarks", "Debit", "Credit", "Balance"],
            [
                "1",
                "11-01-2020",
                "MEDR/CITRUSPAY KO/929584/",
                "5000.00",
                "₹ 0.00",
                "10000.00",
            ],
            [
                "2",
                "04-02-2020",
                "NEFT-OPOSITIVE COMMUNICATION PRIVAT",
                "15000.00",
                "₹ 0.00",
                "9000.00",
            ],
        ]
        txns = _extract_from_tables(_FakePdf(table), "Axis Bank")
        assert len(txns) == 2
        assert txns[0]["debit"] == 5000.0
        assert txns[0]["credit"] == 0.0
        assert txns[1]["debit"] == 15000.0
        assert txns[1]["credit"] == 0.0
