"""AgentScope pipeline — clarify, query build, user-facing loops."""

from __future__ import annotations

import logging
from typing import Any

from backend.widget_studio.agentscope.clarification_agent import run_clarification_agent
from backend.widget_studio.agentscope.models import AgentTurnResult
from backend.widget_studio.agentscope.query_builder_agent import run_query_builder_agent
from backend.widget_studio.vocabulary import CLARIFICATION_LOOP_ERROR

logger = logging.getLogger(__name__)

_MAX_LOOPS = 3


def _checklist(resolved_intent: dict[str, Any] | None) -> dict[str, bool] | None:
    """Build clarification checklist for the frontend."""
    if not resolved_intent:
        return None
    return {
        "metric_confirmed": bool(
            resolved_intent.get("aggregation") or resolved_intent.get("metric_type")
        ),
        "category_confirmed": bool(
            resolved_intent.get("parent_label") or resolved_intent.get("sub_label")
        ),
        "chart_type_selected": bool(resolved_intent.get("widget_type")),
        "filters_applied": True,
    }


async def run_agent_turn(
    *,
    user_message: str,
    conversation: list[dict[str, str]],
    categories_doc: str,
) -> AgentTurnResult:
    """Run clarification and query-builder agents until ready or user input needed.

    Args:
        user_message:    Latest user text.
        conversation:    Prior messages.
        categories_doc:  Category hierarchy JSON for prompts.

    Returns:
        ``AgentTurnResult`` describing the next UI action or successful SQL build.
    """
    steps: list[dict[str, Any]] = []
    doubt: str | None = None
    loops = 0
    clarify_result: dict[str, Any] | None = None
    builder_result: dict[str, Any] | None = None

    while loops < _MAX_LOOPS:
        loops += 1
        clarify_result = await run_clarification_agent(
            user_message=user_message,
            conversation=conversation,
            categories_doc=categories_doc,
            doubt_context=doubt,
        )
        steps.append({"agent": "clarification", "output": clarify_result})

        if clarify_result.get("status") == "needs_clarification":
            question = (
                clarify_result.get("question")
                or "Could you clarify what you want to measure?"
            )
            return AgentTurnResult(
                kind="needs_user",
                reply=question,
                clarify_result=clarify_result,
                chart_suggestions=list(clarify_result.get("chart_suggestions") or []),
                agent_steps=steps,
            )

        resolved_intent = clarify_result.get("resolved_intent")
        if not isinstance(resolved_intent, dict):
            doubt = "Could not parse resolved intent."
            continue

        builder_result = await run_query_builder_agent(resolved_intent)
        steps.append({"agent": "query_builder", "output": builder_result})

        if builder_result.get("status") == "needs_clarification":
            doubt = str(builder_result.get("doubt") or "Need more detail.")
            # Re-clarify once with doubt; next iteration may ask the user.
            clarify_after_doubt = await run_clarification_agent(
                user_message=user_message,
                conversation=conversation,
                categories_doc=categories_doc,
                doubt_context=doubt,
            )
            steps.append(
                {
                    "agent": "clarification",
                    "output": clarify_after_doubt,
                    "after_doubt": True,
                }
            )
            if clarify_after_doubt.get("status") == "needs_clarification":
                question = (
                    clarify_after_doubt.get("question")
                    or doubt
                    or "Could you clarify what you want to measure?"
                )
                return AgentTurnResult(
                    kind="needs_user",
                    reply=question,
                    clarify_result=clarify_after_doubt,
                    builder_result=builder_result,
                    chart_suggestions=list(
                        clarify_after_doubt.get("chart_suggestions") or []
                    ),
                    agent_steps=steps,
                )
            resolved_intent = clarify_after_doubt.get("resolved_intent")
            if not isinstance(resolved_intent, dict):
                continue
            builder_result = await run_query_builder_agent(resolved_intent)
            steps.append(
                {"agent": "query_builder", "output": builder_result, "retry": True}
            )
            if builder_result.get("status") == "needs_clarification":
                return AgentTurnResult(
                    kind="needs_user",
                    reply=str(
                        builder_result.get("doubt")
                        or "I need a bit more detail to build this widget."
                    ),
                    clarify_result=clarify_after_doubt,
                    builder_result=builder_result,
                    chart_suggestions=list(
                        clarify_after_doubt.get("chart_suggestions") or []
                    ),
                    agent_steps=steps,
                )

        abstract_query = builder_result.get("abstract_query")
        if not isinstance(abstract_query, str) or not abstract_query.strip():
            doubt = "Could not build a query."
            continue

        suggestions = list(clarify_result.get("chart_suggestions") or [])
        return AgentTurnResult(
            kind="success",
            clarify_result=clarify_result,
            builder_result=builder_result,
            resolved_intent=resolved_intent,
            abstract_query=abstract_query.strip(),
            chart_suggestions=suggestions,
            clarification_checklist=_checklist(resolved_intent),
            agent_steps=steps,
        )

    return AgentTurnResult(
        kind="error",
        reply=CLARIFICATION_LOOP_ERROR,
        agent_steps=steps,
    )
