"""Parse bank CSV statements into a normalised list of transaction dicts."""

from __future__ import annotations

import io
import logging
from datetime import date as date_type

import pandas as pd

logger = logging.getLogger(__name__)

# Candidate keywords for each logical field — matched as case-insensitive substrings
# of the actual column header, so "Withdrawal (Dr)" matches "withdrawal".
_DATE_KEYWORDS = ["date", "trans date", "transaction date", "value date"]
_DESC_KEYWORDS = [
    "description",
    "narration",
    "details",
    "particulars",
    "remarks",
    "transaction details",
]
_AMOUNT_KEYWORDS = ["amount", "transaction amount"]
_DEBIT_KEYWORDS = ["debit", "withdrawal", "dr"]
_CREDIT_KEYWORDS = ["credit", "deposit", "cr"]


def _find_column(df_columns: list[str], keywords: list[str]) -> str | None:
    """Return the first column whose header contains any keyword (case-insensitive).

    Tries exact match first, then substring match, so a column named exactly
    "Date" is preferred over "Transaction Date" when both are candidates.

    Args:
        df_columns: Actual column names from the DataFrame.
        keywords:   Ordered list of keyword strings to look for.

    Returns:
        The matched column name, or None if no keyword is found in any header.
    """
    lower_cols = {c.lower(): c for c in df_columns}

    # 1. Exact match (case-insensitive)
    for kw in keywords:
        if kw.lower() in lower_cols:
            return lower_cols[kw.lower()]

    # 2. Substring match — only for keywords >= 4 chars to avoid short tokens
    #    like "dr" or "cr" false-matching words like "description".
    for kw in keywords:
        if len(kw) < 4:
            continue
        for col_lower, col_orig in lower_cols.items():
            if kw.lower() in col_lower:
                return col_orig

    return None


def _read_csv_bytes(file_bytes: bytes) -> pd.DataFrame:
    """Read CSV bytes into a DataFrame, trying UTF-8 then latin-1 encoding.

    Args:
        file_bytes: Raw bytes of the CSV file.

    Returns:
        A pandas DataFrame parsed from the CSV content.

    Raises:
        ValueError: If the bytes cannot be decoded or parsed as a CSV.
    """
    for encoding in ("utf-8", "latin-1"):
        try:
            return pd.read_csv(io.BytesIO(file_bytes), encoding=encoding, dtype=str)
        except UnicodeDecodeError:
            continue
        except Exception as exc:
            raise ValueError(f"Failed to parse CSV content: {exc}") from exc
    raise ValueError("CSV file could not be decoded with UTF-8 or latin-1 encoding.")


def parse_csv(file_bytes: bytes, bank_name: str) -> list[dict]:
    """Parse a bank CSV statement into a list of transaction dicts.

    Supports common column-name variations for date, description, and amount.
    Column matching uses case-insensitive substring search so headers like
    ``"Withdrawal (Dr)"`` and ``"Deposit (Cr)"`` are recognised automatically.

    When separate debit/credit columns are present both values are stored
    directly.  When only a combined amount column exists, positive values
    become ``credit`` and negative values become ``debit``.

    Args:
        file_bytes: Raw bytes of the uploaded CSV file.
        bank_name:  Human-readable bank identifier stored on every transaction.

    Returns:
        A list of dicts with keys ``date``, ``description``, ``debit``,
        ``credit``, ``bank_name``, and ``category`` (always ``None``).

    Raises:
        ValueError: If required columns (date, description, amount) cannot be
            resolved from the CSV headers.
    """
    df = _read_csv_bytes(file_bytes)

    # Normalise column names by stripping surrounding whitespace.
    df.columns = [str(c).strip() for c in df.columns]
    actual_columns = df.columns.tolist()

    # --- Resolve date column ---
    date_col = _find_column(actual_columns, _DATE_KEYWORDS)
    if date_col is None:
        raise ValueError(
            f"Cannot find a date column in CSV. Available columns: {actual_columns}."
        )

    # --- Resolve description column ---
    desc_col = _find_column(actual_columns, _DESC_KEYWORDS)
    if desc_col is None:
        raise ValueError(
            f"Cannot find a description column in CSV. Available columns: {actual_columns}."
        )

    # --- Resolve amount column(s) ---
    amount_col = _find_column(actual_columns, _AMOUNT_KEYWORDS)
    debit_col = _find_column(actual_columns, _DEBIT_KEYWORDS)
    credit_col = _find_column(actual_columns, _CREDIT_KEYWORDS)

    has_combined = amount_col is not None
    has_split = debit_col is not None or credit_col is not None

    if not has_combined and not has_split:
        raise ValueError(
            f"Cannot find an amount column in CSV. Available columns: {actual_columns}."
        )

    # --- Compute per-row debit / credit series ---
    if has_split:
        raw_debit = (
            pd.to_numeric(df[debit_col], errors="coerce").fillna(0.0).abs()
            if debit_col
            else pd.Series(0.0, index=df.index)
        )
        raw_credit = (
            pd.to_numeric(df[credit_col], errors="coerce").fillna(0.0).abs()
            if credit_col
            else pd.Series(0.0, index=df.index)
        )
        df["_debit"] = raw_debit
        df["_credit"] = raw_credit
    else:
        combined = pd.to_numeric(df[amount_col], errors="coerce")
        df["_debit"] = combined.where(combined < 0, 0.0).abs()
        df["_credit"] = combined.where(combined >= 0, 0.0)

    # --- Clean text fields ---
    df["_date_str"] = df[date_col].astype(str).str.strip()
    df["_description"] = df[desc_col].astype(str).str.strip()

    # Parse dates to datetime.date — use "mixed" format to handle DD/MM/YYYY and
    # YYYY-MM-DD in the same column without ambiguity warnings (pandas >= 2.0).
    df["_date"] = pd.to_datetime(
        df["_date_str"], errors="coerce", format="mixed", dayfirst=True
    )

    # --- Drop rows where both debit and credit are zero or missing ---
    df = df.dropna(subset=["_debit", "_credit"], how="all")
    df = df[(df["_debit"] != 0.0) | (df["_credit"] != 0.0)]

    # --- Assemble output dicts ---
    transactions: list[dict] = []
    for _, row in df.iterrows():
        parsed_date: date_type | str
        if pd.notna(row["_date"]):
            parsed_date = row["_date"].date()
        else:
            parsed_date = row["_date_str"]
        transactions.append(
            {
                "date": parsed_date,
                "description": row["_description"],
                "debit": float(row["_debit"]),
                "credit": float(row["_credit"]),
                "bank_name": bank_name.strip(),
                "category": None,
                "remarks": None,
            }
        )

    return transactions
