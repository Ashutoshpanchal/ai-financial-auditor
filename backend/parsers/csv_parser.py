"""Parse bank CSV statements into a normalised list of transaction dicts."""

from __future__ import annotations

import io
import logging

import pandas as pd

logger = logging.getLogger(__name__)

# Candidate column names for each logical field, in priority order.
_DATE_CANDIDATES = ["date", "Date", "DATE", "Trans Date", "Transaction Date", "Value Date"]
_DESC_CANDIDATES = [
    "description",
    "Description",
    "DESCRIPTION",
    "Narration",
    "Details",
    "Particulars",
    "Remarks",
    "Transaction Details",
]
_AMOUNT_CANDIDATES = ["amount", "Amount", "AMOUNT", "Transaction Amount"]
_DEBIT_CANDIDATES = ["debit", "Debit", "DEBIT", "Withdrawal", "Dr"]
_CREDIT_CANDIDATES = ["credit", "Credit", "CREDIT", "Deposit", "Cr"]


def _find_column(df_columns: list[str], candidates: list[str]) -> str | None:
    """Return the first candidate column name present in *df_columns*, or None.

    Args:
        df_columns: Actual column names from the DataFrame.
        candidates: Ordered list of column-name variations to look for.

    Returns:
        The matched column name, or None if none of the candidates are present.
    """
    col_set = set(df_columns)
    for candidate in candidates:
        if candidate in col_set:
            return candidate
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
    When separate debit/credit columns are present the function combines them
    into a single signed amount: ``amount = credit - debit``.

    Args:
        file_bytes: Raw bytes of the uploaded CSV file.
        bank_name: Human-readable bank identifier stored on every transaction.

    Returns:
        A list of dicts with keys ``date``, ``description``, ``amount``,
        ``bank_name``, and ``category`` (always ``None`` at parse time).

    Raises:
        ValueError: If required columns (date, description, amount) cannot be
            resolved from the CSV headers.
    """
    df = _read_csv_bytes(file_bytes)

    # Normalise column names by stripping surrounding whitespace.
    df.columns = [str(c).strip() for c in df.columns]
    actual_columns = df.columns.tolist()

    # --- Resolve date column ---
    date_col = _find_column(actual_columns, _DATE_CANDIDATES)
    if date_col is None:
        raise ValueError(
            f"Cannot find a date column in CSV. Available columns: {actual_columns}. "
            f"Expected one of: {_DATE_CANDIDATES}"
        )

    # --- Resolve description column ---
    desc_col = _find_column(actual_columns, _DESC_CANDIDATES)
    if desc_col is None:
        raise ValueError(
            f"Cannot find a description column in CSV. Available columns: {actual_columns}. "
            f"Expected one of: {_DESC_CANDIDATES}"
        )

    # --- Resolve amount column(s) ---
    amount_col = _find_column(actual_columns, _AMOUNT_CANDIDATES)
    debit_col = _find_column(actual_columns, _DEBIT_CANDIDATES)
    credit_col = _find_column(actual_columns, _CREDIT_CANDIDATES)

    has_combined_amount = amount_col is not None
    has_split_amount = debit_col is not None or credit_col is not None

    if not has_combined_amount and not has_split_amount:
        raise ValueError(
            f"Cannot find an amount column in CSV. Available columns: {actual_columns}. "
            f"Expected one of: {_AMOUNT_CANDIDATES} or separate debit/credit columns."
        )

    # --- Build a working DataFrame with only the columns we need ---
    if has_combined_amount:
        df["_amount"] = pd.to_numeric(df[amount_col], errors="coerce")
    else:
        # Combine debit and credit into a single signed amount.
        debit_series = (
            pd.to_numeric(df[debit_col], errors="coerce").fillna(0.0)
            if debit_col
            else pd.Series(0.0, index=df.index)
        )
        credit_series = (
            pd.to_numeric(df[credit_col], errors="coerce").fillna(0.0)
            if credit_col
            else pd.Series(0.0, index=df.index)
        )
        df["_amount"] = credit_series - debit_series

    # --- Clean text fields ---
    df["_date"] = df[date_col].astype(str).str.strip()
    df["_description"] = df[desc_col].astype(str).str.strip()

    # --- Drop rows with zero or missing amounts ---
    df = df.dropna(subset=["_amount"])
    df = df[df["_amount"] != 0.0]

    # --- Assemble output dicts ---
    transactions: list[dict] = []
    for _, row in df.iterrows():
        transactions.append(
            {
                "date": row["_date"],
                "description": row["_description"],
                "amount": float(row["_amount"]),
                "bank_name": bank_name.strip(),
                "category": None,
            }
        )

    return transactions
