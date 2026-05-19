"""Lightweight domain guard before LLM agent calls."""

from __future__ import annotations

import re

from backend.widget_studio.vocabulary import OFF_TOPIC_REPLY

_INJECTION = re.compile(
    r"(ignore\s+(all\s+)?(previous|prior)\s+instructions|"
    r"reveal\s+(the\s+)?(schema|table|column)|"
    r"drop\s+table|delete\s+from|"
    r"system\s+prompt|"
    r"other\s+users?['\u2019]?\s+data)",
    re.IGNORECASE,
)

_OBVIOUS_OFF_TOPIC = re.compile(
    r"\b(weather forecast|write\s+(me\s+)?a\s+poem|python\s+tutorial|"
    r"stock\s+tip|crypto\s+price|recipe\s+for)\b",
    re.IGNORECASE,
)


def check_domain_or_refuse(message: str) -> str | None:
    """Return a refusal string when the message is clearly out of scope.

    Args:
        message: Raw user text.

    Returns:
        User-facing refusal text, or None to proceed with agents.
    """
    text = message.strip()
    if not text:
        return None
    if _INJECTION.search(text) or _OBVIOUS_OFF_TOPIC.search(text):
        return OFF_TOPIC_REPLY
    return None
