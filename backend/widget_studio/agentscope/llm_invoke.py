"""Invoke AgentScope chat model with system + user messages."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from backend.config import get_settings
from backend.widget_studio.agentscope.json_parse import (
    AgentJsonParseError,
    extract_text_from_response,
    parse_json_response,
    summarize_chat_response,
)
from backend.widget_studio.agentscope_config import build_chat_model
from backend.widget_studio.vocabulary import NETWORK_TIMEOUT_MESSAGE

logger = logging.getLogger(__name__)

_AGENT_TIMEOUT_SEC = 90.0


def _model_debug_info() -> dict[str, Any]:
    """Safe model routing metadata for logs (never includes API keys)."""
    settings = get_settings()
    return {
        "provider": "openrouter",
        "model": settings.openrouter_model,
        "base_url": settings.openrouter_base_url,
        "api_key_configured": bool(settings.openrouter_api_key),
    }


async def invoke_json_agent(
    system_prompt: str,
    user_content: str,
    *,
    agent_name: str = "unknown",
) -> dict[str, Any]:
    """Run one JSON agent turn via AgentScope ``OpenAIChatModel``.

    Args:
        system_prompt: System instructions.
        user_content:  User payload (typically JSON string).
        agent_name:    Agent label for logs and ``widget_agent_logs``.

    Returns:
        Parsed JSON object from the model.
    """
    model_info = _model_debug_info()
    request_info = {
        "agent": agent_name,
        "system_prompt_chars": len(system_prompt),
        "user_payload_chars": len(user_content),
        "user_payload_preview": user_content[:400],
    }

    model = build_chat_model(stream=False)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    try:
        response = await asyncio.wait_for(
            model(messages),
            timeout=_AGENT_TIMEOUT_SEC,
        )
    except TimeoutError as exc:
        logger.error(
            "Widget Studio agent timed out: agent=%s timeout_sec=%s model=%s base_url=%s",
            agent_name,
            _AGENT_TIMEOUT_SEC,
            model_info.get("model"),
            model_info.get("base_url"),
        )
        raise ValueError(NETWORK_TIMEOUT_MESSAGE) from exc

    if response is None:
        logger.error(
            "Widget Studio agent returned None response: agent=%s model=%s base_url=%s request=%s",
            agent_name,
            model_info.get("model"),
            model_info.get("base_url"),
            request_info,
        )
        raise AgentJsonParseError(
            "Empty model response (API returned None).",
            details={
                "agent": agent_name,
                "reason": "null_response",
                "model": model_info,
                "request": request_info,
            },
        )

    response_summary = summarize_chat_response(response)
    text = extract_text_from_response(response)

    try:
        return parse_json_response(
            text,
            agent_name=agent_name,
            model_info=model_info,
            request_info=request_info,
            response_summary=response_summary,
        )
    except AgentJsonParseError:
        raise
    except Exception as exc:
        logger.exception(
            "Widget Studio agent unexpected error: agent=%s model=%s base_url=%s",
            agent_name,
            model_info.get("model"),
            model_info.get("base_url"),
        )
        raise AgentJsonParseError(
            f"Unexpected error parsing agent response: {exc}",
            details={
                "agent": agent_name,
                "reason": "unexpected_parse_error",
                "model": model_info,
                "request": request_info,
                "response_blocks": response_summary,
            },
        ) from exc
