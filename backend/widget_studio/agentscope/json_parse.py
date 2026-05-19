"""Parse JSON from AgentScope model responses."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from agentscope.model import ChatResponse

logger = logging.getLogger(__name__)

_JSON_FENCE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)
_LOG_RAW_MAX_CHARS = 8_000


class AgentJsonParseError(ValueError):
    """Model output could not be parsed as the expected JSON object."""

    def __init__(self, message: str, *, details: dict[str, Any]) -> None:
        super().__init__(message)
        self.details = details


def _text_from_content_block(block: Any) -> str:
    """Extract text from an AgentScope content block (dict or object)."""
    if block is None:
        return ""
    if isinstance(block, str):
        return block.strip()
    if isinstance(block, dict):
        for key in ("text", "content", "output_text"):
            value = block.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return ""
    text = getattr(block, "text", None)
    if isinstance(text, str) and text.strip():
        return text.strip()
    content = getattr(block, "content", None)
    if isinstance(content, str) and content.strip():
        return content.strip()
    return ""


def extract_text_from_response(response: ChatResponse) -> str:
    """Concatenate text blocks from a ``ChatResponse``.

    AgentScope ``OpenAIChatModel`` often returns blocks as ``{"type": "text", "text": "..."}``
    dicts rather than objects with a ``.text`` attribute.
    """
    parts: list[str] = []
    for block in response.content:
        chunk = _text_from_content_block(block)
        if chunk:
            parts.append(chunk)
    return "\n".join(parts).strip()


def summarize_chat_response(response: ChatResponse) -> dict[str, Any]:
    """Describe response blocks for logging when text extraction fails or is empty."""
    blocks: list[dict[str, Any]] = []
    for index, block in enumerate(response.content):
        text_str = _text_from_content_block(block)
        entry: dict[str, Any] = {
            "index": index,
            "type": type(block).__name__,
            "text_chars": len(text_str),
            "text_preview": text_str[:300] if text_str else None,
        }
        if isinstance(block, dict):
            entry["block_type"] = block.get("type")
            entry["keys"] = list(block.keys())
        blocks.append(entry)
    return {"block_count": len(blocks), "blocks": blocks}


def _truncate_for_log(
    text: str, *, limit: int = _LOG_RAW_MAX_CHARS
) -> tuple[str, bool]:
    if len(text) <= limit:
        return text, False
    return f"{text[:limit]}\n… [truncated, total_chars={len(text)}]", True


def _log_json_parse_failure(
    *,
    agent_name: str,
    raw_text: str,
    after_fence_text: str,
    model_info: dict[str, Any],
    request_info: dict[str, Any],
    exc: json.JSONDecodeError | None = None,
    reason: str | None = None,
) -> None:
    """Emit structured diagnostics for failed agent JSON parsing."""
    display_raw, truncated = _truncate_for_log(raw_text)
    payload: dict[str, Any] = {
        "agent": agent_name,
        "reason": reason or (str(exc) if exc else "unknown"),
        "model": model_info,
        "request": request_info,
        "raw_chars": len(raw_text),
        "raw_empty": not raw_text.strip(),
        "after_fence_chars": len(after_fence_text),
        "response_truncated_in_log": truncated,
    }
    if exc is not None:
        payload["json_error"] = {
            "msg": exc.msg,
            "lineno": exc.lineno,
            "colno": exc.colno,
            "pos": exc.pos,
        }
    logger.warning(
        "Widget Studio agent JSON parse failed: %s",
        json.dumps(payload, default=str),
    )
    logger.warning(
        "Widget Studio agent raw model output (agent=%s):\n%s",
        agent_name,
        display_raw if display_raw else "<empty>",
    )


def parse_json_response(
    text: str,
    *,
    agent_name: str = "unknown",
    model_info: dict[str, Any] | None = None,
    request_info: dict[str, Any] | None = None,
    response_summary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Extract a JSON object from model output."""
    model_info = model_info or {}
    request_info = request_info or {}
    if response_summary:
        request_info = {**request_info, "response_blocks": response_summary}

    raw_text = text
    stripped = raw_text.strip()
    if not stripped:
        _log_json_parse_failure(
            agent_name=agent_name,
            raw_text=raw_text,
            after_fence_text="",
            model_info=model_info,
            request_info=request_info,
            reason="empty_model_text",
        )
        raise AgentJsonParseError(
            "Agent returned an empty response (no text in model output).",
            details={
                "agent": agent_name,
                "reason": "empty_model_text",
                "model": model_info,
                "request": request_info,
            },
        )

    after_fence = stripped
    fence = _JSON_FENCE.search(stripped)
    if fence:
        after_fence = fence.group(1).strip()

    try:
        parsed = json.loads(after_fence)
    except json.JSONDecodeError as exc:
        _log_json_parse_failure(
            agent_name=agent_name,
            raw_text=raw_text,
            after_fence_text=after_fence,
            model_info=model_info,
            request_info=request_info,
            exc=exc,
            reason="json_decode_error",
        )
        raise AgentJsonParseError(
            f"Agent did not return valid JSON ({exc.msg} at line {exc.lineno} col {exc.colno}).",
            details={
                "agent": agent_name,
                "reason": "json_decode_error",
                "model": model_info,
                "request": request_info,
                "json_error": exc.msg,
                "raw_preview": raw_text[:500],
            },
        ) from exc

    if not isinstance(parsed, dict):
        _log_json_parse_failure(
            agent_name=agent_name,
            raw_text=raw_text,
            after_fence_text=after_fence,
            model_info=model_info,
            request_info=request_info,
            reason=f"json_not_object:{type(parsed).__name__}",
        )
        raise AgentJsonParseError(
            "Agent JSON must be an object.",
            details={
                "agent": agent_name,
                "reason": "json_not_object",
                "parsed_type": type(parsed).__name__,
                "model": model_info,
                "request": request_info,
            },
        )
    return parsed
