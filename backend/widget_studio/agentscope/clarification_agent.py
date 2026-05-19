"""Clarification agent — AgentScope + JSON."""

from __future__ import annotations

import json
from typing import Any

from backend.widget_studio.agentscope.llm_invoke import invoke_json_agent
from backend.widget_studio.prompts import build_clarification_prompt


async def run_clarification_agent(
    *,
    user_message: str,
    conversation: list[dict[str, str]],
    categories_doc: str,
    doubt_context: str | None = None,
) -> dict[str, Any]:
    """Run the clarification agent for one user turn."""
    system = build_clarification_prompt(categories_doc)
    payload = {
        "user_message": user_message,
        "conversation": conversation[-20:],
        "doubt_from_query_builder": doubt_context,
    }
    return await invoke_json_agent(system, json.dumps(payload))
