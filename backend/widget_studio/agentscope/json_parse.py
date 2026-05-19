"""Parse JSON from AgentScope model responses."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from agentscope.model import ChatResponse

logger = logging.getLogger(__name__)

_JSON_FENCE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


def extract_text_from_response(response: ChatResponse) -> str:
    """Concatenate text blocks from a ``ChatResponse``."""
    parts: list[str] = []
    for block in response.content:
        text = getattr(block, "text", None)
        if text:
            parts.append(str(text))
    return "\n".join(parts).strip()


def parse_json_response(text: str) -> dict[str, Any]:
    """Extract a JSON object from model output."""
    stripped = text.strip()
    fence = _JSON_FENCE.search(stripped)
    if fence:
        stripped = fence.group(1).strip()
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError as exc:
        logger.warning("AgentScope agent returned non-JSON: %s", stripped[:200])
        raise ValueError("Agent did not return valid JSON.") from exc
    if not isinstance(parsed, dict):
        raise ValueError("Agent JSON must be an object.")
    return parsed
