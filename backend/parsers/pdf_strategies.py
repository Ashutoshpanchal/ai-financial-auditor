"""PDF parsing strategy constants and normalization utilities."""

from __future__ import annotations

ALLOWED_PDF_PARSE_STRATEGIES: frozenset[str] = frozenset({"auto", "table", "text"})


def normalize_pdf_parse_strategy(strategy: str | None) -> str:
    """Normalize and validate a PDF parsing strategy name.

    Args:
        strategy: Raw strategy name (may be None, uppercase, with whitespace).

    Returns:
        Lowercase normalized strategy name.

    Raises:
        ValueError: If the strategy is not in ALLOWED_PDF_PARSE_STRATEGIES.
    """
    normalized = (strategy or "auto").strip().lower()
    if normalized not in ALLOWED_PDF_PARSE_STRATEGIES:
        raise ValueError(
            f"Invalid PDF parse strategy '{strategy}'. "
            f"Allowed: {', '.join(sorted(ALLOWED_PDF_PARSE_STRATEGIES))}"
        )
    return normalized
