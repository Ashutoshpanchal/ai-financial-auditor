"""Parse bank PDF statements into a normalised list of transaction dicts."""

from __future__ import annotations

import logging
import re
from datetime import datetime

import pdfplumber

logger = logging.getLogger(__name__)

# Date formats tried in order during table-row parsing.
_DATE_FORMATS = ["%d/%m/%Y", "%Y-%m-%d", "%m/%d/%Y", "%d-%m-%Y"]

# Regex for fallback text extraction.
# Captures: (date)  (description)  (signed numeric amount with comma or dot separator)
_TRANSACTION_RE = re.compile(
    r"(\d{2}[/\-]\d{2}[/\-]\d{2,4})\s+(.+?)\s+([-]?\d+[\.,]\d{2})"
)

# Minimum transactions before a parse-quality warning is emitted.
_WARN_THRESHOLD = 3


def _try_parse_date(raw: str) -> str | None:
    """Attempt to parse *raw* as a date string using known formats.

    Args:
        raw: Candidate date string extracted from the PDF.

    Returns:
        ISO-formatted date string (``YYYY-MM-DD``) if parsing succeeds, else ``None``.
    """
    cleaned = raw.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(cleaned, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _is_numeric(value: str) -> bool:
    """Return True if *value* looks like a numeric amount (digits, signs, separators).

    Args:
        value: String to test.

    Returns:
        ``True`` when the string represents a number, ``False`` otherwise.
    """
    cleaned = value.strip().replace(",", "").replace(".", "").replace("-", "").replace("+", "")
    return cleaned.isdigit() and len(cleaned) > 0


def _parse_amount(raw: str) -> float | None:
    """Convert a raw amount string to a float.

    Handles both comma (European) and dot (US/UK) decimal separators.

    Args:
        raw: Raw amount string, e.g. ``"1,234.56"`` or ``"1.234,56"``.

    Returns:
        Parsed float, or ``None`` if conversion fails.
    """
    stripped = raw.strip()
    # Detect European format: last separator is a comma.
    if "," in stripped and "." in stripped:
        if stripped.rindex(",") > stripped.rindex("."):
            # European: 1.234,56 → remove dots, replace comma with dot
            stripped = stripped.replace(".", "").replace(",", ".")
        else:
            # US: 1,234.56 → just remove commas
            stripped = stripped.replace(",", "")
    elif "," in stripped:
        stripped = stripped.replace(",", ".")
    try:
        return float(stripped)
    except ValueError:
        return None


def _extract_from_tables(pdf: pdfplumber.PDF, bank_name: str) -> list[dict]:
    """Extract transactions from pdfplumber table structures across all pages.

    A row is treated as a transaction when its first cell contains a parseable
    date and its last cell contains a numeric amount.

    Args:
        pdf: An open ``pdfplumber.PDF`` object.
        bank_name: Bank identifier stored on each transaction dict.

    Returns:
        List of transaction dicts, may be empty if no valid rows are found.
    """
    transactions: list[dict] = []

    for page in pdf.pages:
        tables = page.extract_tables()
        if not tables:
            continue

        for table in tables:
            for row in table:
                if not row or len(row) < 3:
                    continue

                # First cell must be a date.
                raw_date = str(row[0] or "").strip()
                parsed_date = _try_parse_date(raw_date)
                if parsed_date is None:
                    continue

                # Last cell must be a numeric amount.
                raw_amount = str(row[-1] or "").strip()
                if not raw_amount:
                    continue
                amount = _parse_amount(raw_amount)
                if amount is None:
                    continue

                # Middle cells joined as description.
                description = " ".join(
                    str(cell or "").strip() for cell in row[1:-1]
                ).strip()

                transactions.append(
                    {
                        "date": parsed_date,
                        "description": description,
                        "amount": amount,
                        "bank_name": bank_name.strip(),
                        "category": None,
                    }
                )

    return transactions


def _extract_from_text(pdf: pdfplumber.PDF, bank_name: str) -> list[dict]:
    """Fall back to regex-based text extraction when no tables are found.

    Scans all page text for lines matching ``_TRANSACTION_RE``.

    Args:
        pdf: An open ``pdfplumber.PDF`` object.
        bank_name: Bank identifier stored on each transaction dict.

    Returns:
        List of transaction dicts matched by the regex pattern.
    """
    transactions: list[dict] = []

    for page in pdf.pages:
        text = page.extract_text() or ""
        for match in _TRANSACTION_RE.finditer(text):
            raw_date, description, raw_amount = match.group(1), match.group(2), match.group(3)

            parsed_date = _try_parse_date(raw_date)
            if parsed_date is None:
                parsed_date = raw_date.strip()

            amount = _parse_amount(raw_amount)
            if amount is None:
                continue

            transactions.append(
                {
                    "date": parsed_date,
                    "description": description.strip(),
                    "amount": amount,
                    "bank_name": bank_name.strip(),
                    "category": None,
                }
            )

    return transactions


def parse_pdf(file_bytes: bytes, bank_name: str) -> list[dict]:
    """Parse a bank PDF statement into a list of transaction dicts.

    First attempts structured table extraction via pdfplumber. If no tables
    are found the function falls back to full-page text extraction with a
    regex pattern to identify transaction lines.

    Args:
        file_bytes: Raw bytes of the uploaded PDF file.
        bank_name: Human-readable bank identifier stored on every transaction.

    Returns:
        A list of dicts with keys ``date``, ``description``, ``amount``,
        ``bank_name``, and ``category`` (always ``None`` at parse time).

    Raises:
        ValueError: If the PDF cannot be opened or no transactions are found.
    """
    import io

    try:
        pdf_file = io.BytesIO(file_bytes)
        pdf = pdfplumber.open(pdf_file)
    except Exception as exc:
        raise ValueError(f"Cannot open PDF: {exc}") from exc

    with pdf:
        transactions = _extract_from_tables(pdf, bank_name)

        if not transactions:
            logger.info(
                "No tables found in PDF for bank '%s'; falling back to text extraction.",
                bank_name,
            )
            transactions = _extract_from_text(pdf, bank_name)

    if not transactions:
        raise ValueError(
            f"No transactions found in the PDF for bank '{bank_name}'. "
            "The file may be scanned/image-only or use an unsupported layout."
        )

    if len(transactions) < _WARN_THRESHOLD:
        logger.warning(
            "Only %d transaction(s) found in PDF for bank '%s'. "
            "This may indicate a partial or mis-parsed statement.",
            len(transactions),
            bank_name,
        )

    return transactions
