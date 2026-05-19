"""Invoke AgentScope chat model with system + user messages."""

from __future__ import annotations

import asyncio
from typing import Any

from backend.widget_studio.agentscope.json_parse import (
    extract_text_from_response,
    parse_json_response,
)
from backend.widget_studio.agentscope_config import build_chat_model
from backend.widget_studio.vocabulary import NETWORK_TIMEOUT_MESSAGE

_AGENT_TIMEOUT_SEC = 90.0


async def invoke_json_agent(system_prompt: str, user_content: str) -> dict[str, Any]:
    """Run one JSON agent turn via AgentScope ``OpenAIChatModel``.

    Args:
        system_prompt: System instructions.
        user_content:  User payload (typically JSON string).

    Returns:
        Parsed JSON object from the model.
    """
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
        raise ValueError(NETWORK_TIMEOUT_MESSAGE) from exc
    if response is None:
        raise ValueError("Empty model response.")
    text = extract_text_from_response(response)
    return parse_json_response(text)
