"""Parse bank PDF statements into a normalised list of transaction dicts."""

from __future__ import annotations

import io
import logging
import re
from datetime import datetime

import pdfplumber

logger = logging.getLogger(__name__)

# Date formats tried in order during table-row parsing.
_DATE_FORMATS = ["%d/%m/%Y", "%Y-%m-%d", "%m/%d/%Y", "%d-%m-%Y"]

# Regex for fallback text extraction.
_TRANSACTION_RE = re.compile(
    r"(\d{2}[/\-]\d{2}[/\-]\d{2,4})\s+(.+?)\s+([-]?\d+[\.,]\d{2})"
)

# Minimum transactions before a parse-quality warning is emitted.
_WARN_THRESHOLD = 3

# Known bank name patterns — matched against the first few pages of text.
# Order matters: more specific patterns first.
_BANK_PATTERNS: list[tuple[re.Pattern, str]] = [
    # US Banks
    (re.compile(r"\bChase\b", re.IGNORECASE), "Chase"),
    (re.compile(r"\bJPMorgan\b", re.IGNORECASE), "JPMorgan Chase"),
    (re.compile(r"\bBank\s+of\s+America\b", re.IGNORECASE), "Bank of America"),
    (re.compile(r"\bWells\s+Fargo\b", re.IGNORECASE), "Wells Fargo"),
    (re.compile(r"\bCitibank\b|\bCiti\s+Bank\b", re.IGNORECASE), "Citibank"),
    (re.compile(r"\bCapital\s+One\b", re.IGNORECASE), "Capital One"),
    (re.compile(r"\bUSAA\b", re.IGNORECASE), "USAA"),
    (re.compile(r"\bTD\s+Bank\b", re.IGNORECASE), "TD Bank"),
    (re.compile(r"\bPNC\s+Bank\b", re.IGNORECASE), "PNC Bank"),
    (re.compile(r"\bSchwab\b", re.IGNORECASE), "Charles Schwab"),
    (re.compile(r"\bAlly\s+Bank\b", re.IGNORECASE), "Ally Bank"),
    (re.compile(r"\bDiscover\s+Bank\b", re.IGNORECASE), "Discover"),
    (
        re.compile(r"\bGoldman\s+Sachs\b|\bMarcus\b", re.IGNORECASE),
        "Marcus by Goldman Sachs",
    ),
    (re.compile(r"\bTruist\b", re.IGNORECASE), "Truist"),
    (re.compile(r"\bFifth\s+Third\b", re.IGNORECASE), "Fifth Third Bank"),
    (re.compile(r"\bRegions\s+Bank\b", re.IGNORECASE), "Regions Bank"),
    (re.compile(r"\bKeyBank\b", re.IGNORECASE), "KeyBank"),
    (re.compile(r"\bHuntington\s+Bank\b", re.IGNORECASE), "Huntington Bank"),
    (re.compile(r"\bComerica\b", re.IGNORECASE), "Comerica"),
    (re.compile(r"\bZions\s+Bank\b", re.IGNORECASE), "Zions Bank"),
    # Indian Banks
    (re.compile(r"\bHDFC\b", re.IGNORECASE), "HDFC"),
    (re.compile(r"\bICICI\b", re.IGNORECASE), "ICICI"),
    (re.compile(r"\bSBI\b|\bState\s+Bank\s+of\s+India\b", re.IGNORECASE), "SBI"),
    (re.compile(r"\bAxis\s+Bank\b", re.IGNORECASE), "Axis Bank"),
    (re.compile(r"\bKotak\b", re.IGNORECASE), "Kotak Mahindra Bank"),
    (re.compile(r"\bIndusInd\b", re.IGNORECASE), "IndusInd Bank"),
    (re.compile(r"\bPNB\b|\bPunjab\s+National\s+Bank\b", re.IGNORECASE), "PNB"),
    (re.compile(r"\bCanara\s+Bank\b", re.IGNORECASE), "Canara Bank"),
    (re.compile(r"\bBank\s+of\s+Baroda\b|\bBOB\b", re.IGNORECASE), "Bank of Baroda"),
    (re.compile(r"\bYes\s+Bank\b", re.IGNORECASE), "Yes Bank"),
    (re.compile(r"\bIDFC\s+First\b", re.IGNORECASE), "IDFC First Bank"),
    # UK / International
    (re.compile(r"\bBarclays\b", re.IGNORECASE), "Barclays"),
    (re.compile(r"\bHSBC\b", re.IGNORECASE), "HSBC"),
    (re.compile(r"\bLloyds\b", re.IGNORECASE), "Lloyds Bank"),
    (re.compile(r"\bNatWest\b", re.IGNORECASE), "NatWest"),
    (re.compile(r"\bSantander\b", re.IGNORECASE), "Santander"),
    (re.compile(r"\bRBS\b", re.IGNORECASE), "RBS"),
    (re.compile(r"\bMonzo\b", re.IGNORECASE), "Monzo"),
    (re.compile(r"\bRevolut\b", re.IGNORECASE), "Revolut"),
    (re.compile(r"\bStarling\s+Bank\b", re.IGNORECASE), "Starling Bank"),
    (re.compile(r"\bN26\b", re.IGNORECASE), "N26"),
    (re.compile(r"\bDeutsche\s+Bank\b", re.IGNORECASE), "Deutsche Bank"),
    (re.compile(r"\bCommerzbank\b", re.IGNORECASE), "Commerzbank"),
    (re.compile(r"\bANZ\b", re.IGNORECASE), "ANZ"),
    (
        re.compile(r"\bCommonwealth\s+Bank\b|\bCommBank\b", re.IGNORECASE),
        "Commonwealth Bank",
    ),
    (re.compile(r"\bWestpac\b", re.IGNORECASE), "Westpac"),
    # Credit Unions / Others
    (re.compile(r"\bAmerican\s+Express\b|\bAmex\b", re.IGNORECASE), "American Express"),
    (re.compile(r"\bDiscover\b", re.IGNORECASE), "Discover"),
]


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


# Regex to strip trailing noise (dashes, underscores, slashes, spaces) from remark parts.
_NOISE_TAIL_RE = re.compile(r"[-_\s/]+$")
# Regex to strip trailing literal word "remark" appended by some banks.
_REMARK_SUFFIX_RE = re.compile(r"\s*\bREMARK\b\s*$", re.IGNORECASE)

# Short alphabetic bank codes found in position 3 of Indian bank remarks.
_BANK_CODE_MAX_LEN = 6


def _clean_remark_part(value: str) -> str:
    """Strip trailing noise characters and the word 'remark' from a remark part.

    Args:
        value: Raw part string split from a bank transaction description.

    Returns:
        Cleaned string with trailing dashes, slashes, spaces, and the word
        'remark' removed.
    """
    cleaned = _REMARK_SUFFIX_RE.sub("", value.strip()).strip()
    cleaned = _NOISE_TAIL_RE.sub("", cleaned).strip()
    return cleaned


def _parse_remarks(description: str) -> dict | None:
    """Split a transaction description by ``/`` into structured remark parts.

    For example::

        "NEFT/38552090651DC/ICIC/MAGENTA CONNECT PRIV---------- remark"
        → {"mode": "NEFT", "reference": "38552090651DC",
            "bank_code": "ICIC", "merchant": "MAGENTA CONNECT PRIV"}

        "UPI/412345678901/merchant@paytm"
        → {"mode": "UPI", "reference": "412345678901", "merchant": "merchant@paytm"}

    Returns ``None`` when the description does not contain ``/`` or has fewer
    than 2 parts after splitting.

    Args:
        description: Raw transaction description string.

    Returns:
        Dict with keys ``mode``, ``reference``, ``bank_code``,
        ``merchant`` (all optional depending on how many parts exist),
        or ``None`` when the description is not slash-delimited.
    """
    if "/" not in description:
        return None

    raw_parts = [p.strip() for p in description.split("/") if p.strip()]
    if len(raw_parts) < 2:
        return None

    # Clean noise from every part before interpreting positions.
    parts = [_clean_remark_part(p) for p in raw_parts]
    parts = [p for p in parts if p]
    if len(parts) < 2:
        return None

    remarks: dict = {}

    # Part 0: payment mode (NEFT, RTGS, UPI, IMPS, etc.)
    remarks["mode"] = parts[0].upper()

    # Part 1: reference / transaction ID
    remarks["reference"] = parts[1]

    if len(parts) >= 3:
        third = parts[2]
        if "@" in third:
            # UPI VPA format (e.g. merchant@paytm) — treat as merchant directly.
            remarks["merchant"] = third
        elif len(third) <= _BANK_CODE_MAX_LEN and third.replace(" ", "").isalpha():
            # Short all-alpha code → beneficiary bank code (ICIC, HDFC, SBIN, …).
            remarks["bank_code"] = third
        else:
            # Longer / mixed string → treat as merchant name.
            remarks["merchant"] = third

    if len(parts) >= 4:
        # Remaining parts form the merchant / payer name.
        merchant_parts = " / ".join(parts[3:])
        if "merchant" in remarks:
            remarks["merchant"] = f"{remarks['merchant']} / {merchant_parts}"
        else:
            remarks["merchant"] = merchant_parts

    return remarks if len(remarks) > 1 else None


def _is_numeric(value: str) -> bool:
    """Return True if *value* looks like a numeric amount (digits, signs, separators).

    Args:
        value: String to test.

    Returns:
        ``True`` when the string represents a number, ``False`` otherwise.
    """
    cleaned = (
        value.strip()
        .replace(",", "")
        .replace(".", "")
        .replace("-", "")
        .replace("+", "")
    )
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
    if "," in stripped and "." in stripped:
        if stripped.rindex(",") > stripped.rindex("."):
            stripped = stripped.replace(".", "").replace(",", ".")
        else:
            stripped = stripped.replace(",", "")
    elif "," in stripped:
        stripped = stripped.replace(",", ".")
    try:
        return float(stripped)
    except ValueError:
        return None


def _extract_bank_name(pdf: pdfplumber.PDF) -> str | None:
    """Try to detect the bank name from the first few pages of the PDF.

    Scans the first 3 pages (or fewer) for known bank name patterns.

    Args:
        pdf: An open ``pdfplumber.PDF`` object.

    Returns:
        Detected bank name string, or ``None`` if no known pattern matches.
    """
    pages_to_scan = min(len(pdf.pages), 3)
    for page_idx in range(pages_to_scan):
        text = pdf.pages[page_idx].extract_text() or ""
        for pattern, bank_name in _BANK_PATTERNS:
            if pattern.search(text):
                logger.info(
                    "Auto-detected bank name '%s' from PDF page %d",
                    bank_name,
                    page_idx + 1,
                )
                return bank_name
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

                raw_date = str(row[0] or "").strip()
                parsed_date = _try_parse_date(raw_date)
                if parsed_date is None:
                    continue

                raw_amount = str(row[-1] or "").strip()
                if not raw_amount:
                    continue
                amount = _parse_amount(raw_amount)
                if amount is None:
                    continue

                description = " ".join(
                    str(cell or "").strip() for cell in row[1:-1]
                ).strip()

                debit = abs(amount) if amount < 0 else 0.0
                credit = amount if amount >= 0 else 0.0
                transactions.append(
                    {
                        "date": parsed_date,
                        "description": description,
                        "debit": debit,
                        "credit": credit,
                        "bank_name": bank_name.strip(),
                        "category": None,
                        "remarks": None,
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
            raw_date, description, raw_amount = (
                match.group(1),
                match.group(2),
                match.group(3),
            )

            parsed_date = _try_parse_date(raw_date)
            if parsed_date is None:
                parsed_date = raw_date.strip()

            amount = _parse_amount(raw_amount)
            if amount is None:
                continue

            clean_desc = description.strip()
            debit = abs(amount) if amount < 0 else 0.0
            credit = amount if amount >= 0 else 0.0
            transactions.append(
                {
                    "date": parsed_date,
                    "description": clean_desc,
                    "debit": debit,
                    "credit": credit,
                    "bank_name": bank_name.strip(),
                    "category": None,
                    "remarks": None,
                }
            )

    return transactions


def parse_pdf(
    file_bytes: bytes,
    bank_name: str | None = None,
    password: str | None = None,
) -> list[dict]:
    """Parse a bank PDF statement into a list of transaction dicts.

    First attempts structured table extraction via pdfplumber. If no tables
    are found the function falls back to full-page text extraction with a
    regex pattern to identify transaction lines.

    If *bank_name* is ``None`` or empty the function auto-detects the bank
    from the PDF content using known bank name patterns.

    Args:
        file_bytes: Raw bytes of the uploaded PDF file.
        bank_name:  Human-readable bank identifier stored on every transaction.
                    If ``None`` or empty, auto-detected from PDF content.
        password:   Optional decryption password for password-protected PDFs.

    Returns:
        A list of dicts with keys ``date``, ``description``, ``amount``,
        ``bank_name``, and ``category`` (always ``None`` at parse time).

    Raises:
        ValueError: If the PDF cannot be opened, is encrypted without a valid
                    password, or no transactions are found.
    """

    try:
        pdf_file = io.BytesIO(file_bytes)
        open_kwargs: dict = {}
        if password:
            open_kwargs["password"] = password
        pdf = pdfplumber.open(pdf_file, **open_kwargs)
    except Exception as exc:
        msg = str(exc).lower()
        if "password" in msg or "encrypt" in msg or "decrypt" in msg:
            raise ValueError(
                "This PDF is password-protected. Please provide the correct password."
            ) from exc
        raise ValueError(f"Cannot open PDF: {exc}") from exc

    with pdf:
        # Auto-detect bank name if not provided
        detected_bank = None
        if not bank_name or not bank_name.strip():
            detected_bank = _extract_bank_name(pdf)
            bank_name = detected_bank or "Unknown Bank"
            if detected_bank:
                logger.info("Auto-detected bank name: %s", bank_name)
            else:
                logger.warning(
                    "Could not auto-detect bank name from PDF; using 'Unknown Bank'."
                )

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
