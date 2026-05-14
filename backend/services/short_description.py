"""Derive ``Transaction.short_description`` from full bank ``description`` strings."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

_MAX_LEN = 512

_RAILS = frozenset({"upi", "nach", "neft", "imps", "rtgs", "ft"})


def _dedupe_consecutive_tokens_ci(tokens: list[str]) -> list[str]:
    """Drop consecutive tokens that are equal case-insensitively."""
    out: list[str] = []
    prev_lower: str | None = None
    for tok in tokens:
        t = tok.strip()
        if not t:
            continue
        lower = t.lower()
        if prev_lower is not None and lower == prev_lower:
            continue
        out.append(t)
        prev_lower = lower
    return out


def _strip_edge_noise_tokens(tokens: list[str]) -> list[str]:
    """Remove noise tokens that appear at both start and end of the token list.

    For example ``["upi", "zomato", "upi"]`` becomes ``["zomato"]`` because
    ``upi`` is a rail prefix/suffix that carries no merchant signal.
    Only strips when the same token (case-insensitive) is present at both
    the first and last position and there are at least 3 tokens (to avoid
    stripping meaningful 2-token descriptions).
    """
    if len(tokens) <= 2:
        return tokens
    first = tokens[0].lower()
    last = tokens[-1].lower()
    if first == last:
        return tokens[1:-1]
    return tokens


def _strip_edge_punct(token: str) -> str:
    """Trim leading/trailing non-word characters (keeps internal hyphens)."""
    return re.sub(r"^[^\w]+|[^\w]+$", "", token, flags=re.UNICODE)


@lru_cache(maxsize=1)
def _merchant_rules() -> list[tuple[int, str, str]]:
    """Load rules as (priority, needle, canonical), sorted for match order."""
    path = Path(__file__).with_name("merchant_canonical.json")
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    rules_raw = data.get("rules")
    if not isinstance(rules_raw, list):
        return []
    out: list[tuple[int, str, str]] = []
    for row in rules_raw:
        if not isinstance(row, dict):
            continue
        needle = str(row.get("needle", "")).strip().lower()
        canonical = str(row.get("canonical", needle)).strip().lower()
        if not needle or not canonical:
            continue
        try:
            priority = int(row.get("priority", 0))
        except (TypeError, ValueError):
            priority = 0
        out.append((priority, needle, canonical))
    out.sort(key=lambda t: (-t[0], -len(t[1]), t[1]))
    return out


def _infer_rail(base: str, raw: str) -> str | None:
    """Return a short rail prefix (upi, nach, …) when detectable."""
    b = (base or "").strip().lower()
    if b:
        head = b.split("-", 1)[0].strip()
        if head in _RAILS:
            return head
    r = (raw or "").strip().lower()
    if r.startswith("upi/") or r.startswith("upi "):
        return "upi"
    if r.startswith("nach"):
        return "nach"
    if r.startswith("neft"):
        return "neft"
    if r.startswith("imps"):
        return "imps"
    if r.startswith("rtgs"):
        return "rtgs"
    return None


def _collapse_by_merchant_registry(base: str, raw: str) -> str:
    """If base+raw hits a configured merchant needle, return ``{rail}-{canonical}``."""
    hay = f"{base} {raw}".lower()
    for _prio, needle, canonical in _merchant_rules():
        if needle in hay:
            rail = _infer_rail(base, raw)
            if rail:
                return f"{rail}-{canonical}"
            return canonical
    return base


def compute_short_description(description: str) -> str:
    """Return a stable lowercase key for grouping similar transaction descriptions.

    Rules:
    - **UPI + VPA** (``UPI/local@host/...``): use ``upi-<local>`` where ``local`` is the
      part before ``@``; non-alphanumeric characters removed; **digits in the handle are kept**.
    - **Otherwise**: remove all digit runs with regex, collapse slashes, tokenize on
      whitespace, strip edge punctuation per token, **dedupe consecutive tokens**
      case-insensitively, join with ``-``, lowercase, cap length.
    - **Merchant collapse**: ``merchant_canonical.json`` needles matched against the
      normalized key plus original description yield ``<rail>-<canonical>`` when a rail
      is known (e.g. several Zomato/Razorpay wordings become ``upi-zomato``).
    - If that yields nothing, fall back to a trimmed whitespace-normalized ``description``
      (lowercased), capped at ``_MAX_LEN``.

    Args:
        description: Raw transaction description from statement import.

    Returns:
        Normalized ``short_description`` (may be empty when ``description`` is empty).
    """
    raw = (description or "").strip()
    if not raw:
        return ""

    parts = [p.strip() for p in raw.split("/") if p.strip()]
    if len(parts) >= 2 and parts[0].upper() == "UPI" and "@" in parts[1]:
        local = parts[1].split("@", 1)[0].strip()
        local = re.sub(r"[^\w._-]", "", local, flags=re.UNICODE)
        if local:
            short = f"upi-{local.lower()}"
            return _collapse_by_merchant_registry(short, raw)[:_MAX_LEN]

    no_digits = re.sub(r"\d+", "", raw)
    no_digits = re.sub(r"/+", "/", no_digits)
    spaced = no_digits.replace("/", " ").strip()
    raw_tokens = [t for t in spaced.split() if t]
    cleaned: list[str] = []
    for t in raw_tokens:
        c = _strip_edge_punct(t)
        if c:
            cleaned.append(c)

    deduped = _dedupe_consecutive_tokens_ci(cleaned)
    stripped = _strip_edge_noise_tokens(deduped)
    if stripped:
        out = "-".join(x.lower() for x in stripped)
        return _collapse_by_merchant_registry(out, raw)[:_MAX_LEN]

    fallback = re.sub(r"\s+", " ", raw).strip().lower()
    return _collapse_by_merchant_registry(fallback, raw)[:_MAX_LEN]
