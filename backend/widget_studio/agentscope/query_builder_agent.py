"""Query builder agent — AgentScope + JSON."""

from __future__ import annotations

import json
from typing import Any

from backend.widget_studio.agentscope.llm_invoke import invoke_json_agent
from backend.widget_studio.prompts import QUERY_BUILDER_AGENT_PROMPT


async def run_query_builder_agent(resolved_intent: dict[str, Any]) -> dict[str, Any]:
    """Generate abstract SQL from clarified intent."""
    return await invoke_json_agent(
        QUERY_BUILDER_AGENT_PROMPT,
        json.dumps({"resolved_intent": resolved_intent}),
    )
