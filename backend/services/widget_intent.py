"""Keyword-based widget template and direction detection for Widget Studio."""

from __future__ import annotations

import re

WidgetIntentTemplate = str  # "spend" | "receive"
WidgetTemplateKind = str  # "single_metric" | "spend_receive_pair"

_SPEND_KEYWORDS: frozenset[str] = frozenset(
    {
        "spend",
        "spent",
        "spending",
        "expense",
        "expenses",
        "paid",
        "payment",
        "purchase",
        "purchases",
        "debit",
        "outflow",
        "outflows",
        "bill",
        "bills",
    }
)

_RECEIVE_KEYWORDS: frozenset[str] = frozenset(
    {
        "receive",
        "received",
        "receiving",
        "income",
        "salary",
        "credit",
        "inflow",
        "inflows",
        "deposit",
        "deposits",
        "refund",
        "refunds",
        "receiver",
    }
)

_PAIR_PHRASES: tuple[str, ...] = (
    "spend and receive",
    "spend and income",
    "income and expense",
    "income and spend",
    "in vs out",
    "in and out",
    "money in",
    "received and spent",
    "spending and income",
    "overview",
    "both spend",
    "spend receive",
)

_TOKEN_RE = re.compile(r"[a-z]+")


def detect_widget_template(message: str) -> WidgetTemplateKind:
    """Choose single-value vs spend+received pair widget template.

    Args:
        message: Latest user chat message.

    Returns:
        ``single_metric`` or ``spend_receive_pair``.
    """
    if not message or not message.strip():
        return "single_metric"

    lowered = message.lower()
    for phrase in _PAIR_PHRASES:
        if phrase in lowered:
            return "spend_receive_pair"

    tokens = _TOKEN_RE.findall(lowered)
    has_spend = any(t in _SPEND_KEYWORDS for t in tokens)
    has_receive = any(t in _RECEIVE_KEYWORDS for t in tokens)
    if has_spend and has_receive:
        return "spend_receive_pair"

    if " both " in f" {lowered} " or lowered.strip().startswith("both "):
        return "spend_receive_pair"

    return "single_metric"


def detect_widget_intent_template(message: str) -> WidgetIntentTemplate | None:
    """Score user text for spend vs receive direction (single_metric only).

    Args:
        message: Latest user chat message.

    Returns:
        ``spend``, ``receive``, or ``None`` when ambiguous or no signal.
    """
    if not message or not message.strip():
        return None

    if detect_widget_template(message) == "spend_receive_pair":
        return None

    tokens = _TOKEN_RE.findall(message.lower())
    if not tokens:
        return None

    spend_score = sum(1 for t in tokens if t in _SPEND_KEYWORDS)
    receive_score = sum(1 for t in tokens if t in _RECEIVE_KEYWORDS)

    if spend_score > receive_score:
        return "spend"
    if receive_score > spend_score:
        return "receive"
    return None
