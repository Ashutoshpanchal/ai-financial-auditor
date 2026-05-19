"""Tests for AgentScope Widget Studio pipeline routing."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from backend.widget_studio.agentscope.pipeline import run_agent_turn


@pytest.mark.asyncio
async def test_pipeline_needs_user_when_clarification_asks() -> None:
    """Clarification agent can short-circuit to user question."""
    with patch(
        "backend.widget_studio.agentscope.pipeline.run_clarification_agent",
        new_callable=AsyncMock,
        return_value={
            "status": "needs_clarification",
            "question": "Which category?",
            "chart_suggestions": ["bar_chart"],
        },
    ):
        result = await run_agent_turn(
            user_message="spending",
            conversation=[],
            categories_doc="{}",
        )
    assert result.kind == "needs_user"
    assert result.reply == "Which category?"
    assert result.chart_suggestions == ["bar_chart"]


@pytest.mark.asyncio
async def test_pipeline_success_returns_abstract_query() -> None:
    """Resolved intent + builder success yields abstract SQL."""
    clarify = {
        "status": "ready",
        "resolved_intent": {
            "aggregation": "sum",
            "parent_label": "Food",
            "widget_type": "metric",
        },
        "chart_suggestions": [],
    }
    builder = {
        "status": "success",
        "abstract_query": "SELECT SUM(outflow) FROM source_table",
    }
    with (
        patch(
            "backend.widget_studio.agentscope.pipeline.run_clarification_agent",
            new_callable=AsyncMock,
            return_value=clarify,
        ),
        patch(
            "backend.widget_studio.agentscope.pipeline.run_query_builder_agent",
            new_callable=AsyncMock,
            return_value=builder,
        ),
    ):
        result = await run_agent_turn(
            user_message="food spend",
            conversation=[],
            categories_doc="{}",
        )
    assert result.kind == "success"
    assert result.abstract_query == "SELECT SUM(outflow) FROM source_table"
    assert result.clarification_checklist is not None
