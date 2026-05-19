"""Widget Studio orchestrator — AgentScope pipeline + deterministic SQL."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.widget_studio import WidgetChatMessage, WidgetChatSession
from backend.widget_studio.agent_logging import AgentTimer, log_agent_call
from backend.widget_studio.agentscope.pipeline import run_agent_turn
from backend.widget_studio.context_loader import get_session_categories_doc
from backend.widget_studio.domain_guard import check_domain_or_refuse
from backend.widget_studio.query_executor import (
    WidgetQueryExecutionError,
    execute_resolved_query,
)
from backend.widget_studio.query_translator import translate_abstract_sql
from backend.widget_studio.vocabulary import CLARIFICATION_LOOP_ERROR

logger = logging.getLogger(__name__)


def _sanitize_widget_preview(
    preview: dict[str, Any] | None, *, include_sql: bool
) -> dict[str, Any] | None:
    """Strip resolved SQL from previews for non–super-admin clients."""
    if preview is None or include_sql:
        return preview
    safe = dict(preview)
    safe.pop("resolved_query", None)
    return safe


def _conversation_from_messages(
    messages: list[WidgetChatMessage],
) -> list[dict[str, str]]:
    """Map ORM messages to role/content dicts for agents."""
    return [{"role": m.role, "content": m.content} for m in messages]


def _build_widget_preview(
    *,
    widget_type: str,
    data: dict[str, Any],
    chart_config: dict[str, Any] | None,
) -> dict[str, Any]:
    """Package execution result for the preview panel."""
    return {
        "type": widget_type,
        "data": data,
        "chart_config": chart_config or {},
    }


def _hardcoded_filters_from_intent(intent: dict[str, Any]) -> dict[str, str] | None:
    """Extract literal category filters for widget storage."""
    out: dict[str, str] = {}
    if intent.get("parent_label"):
        out["parent_label"] = str(intent["parent_label"])
    if intent.get("sub_label"):
        out["sub_label"] = str(intent["sub_label"])
    return out or None


async def run_widget_studio_turn(
    session: WidgetChatSession,
    user_message: str,
    db: Session,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    bank: str | None = None,
    include_agent_logs: bool = False,
    include_sql_in_preview: bool = False,
) -> dict[str, Any]:
    """Process one Widget Studio message through the AgentScope pipeline."""
    if not user_message.strip():
        raise ValueError("Message must not be empty.")

    user_id = session.user_id
    session_id = session.id

    refusal = check_domain_or_refuse(user_message)
    if refusal:
        log_agent_call(
            db,
            session_id=session_id,
            agent_name="domain_guard",
            input_data={"message": user_message.strip()},
            output_data={"refused": True},
            duration_ms=0,
        )
        return await _finalize_assistant(
            session,
            db,
            reply=refusal,
            metadata={"off_topic": True},
            chart_suggestions=[],
            clarification_checklist=None,
            widget_preview=None,
            agent_logs=[],
        )

    db.add(
        WidgetChatMessage(
            id=str(uuid4()),
            session_id=session_id,
            role="user",
            content=user_message.strip(),
        )
    )

    prior = list(
        db.scalars(
            select(WidgetChatMessage)
            .where(WidgetChatMessage.session_id == session_id)
            .order_by(WidgetChatMessage.created_at)
        ).all()
    )
    conversation = _conversation_from_messages(prior)
    categories_doc = get_session_categories_doc(session_id, user_id, db)

    agent_logs: list[dict[str, Any]] = []

    try:
        turn = await run_agent_turn(
            user_message=user_message.strip(),
            conversation=conversation,
            categories_doc=categories_doc,
        )
    except ValueError as exc:
        log_agent_call(
            db,
            session_id=session_id,
            agent_name="agentscope_pipeline",
            error=str(exc),
            duration_ms=0,
        )
        raise

    for step in turn.agent_steps:
        log_agent_call(
            db,
            session_id=session_id,
            agent_name=str(step.get("agent", "unknown")),
            output_data=step.get("output")
            if isinstance(step.get("output"), dict)
            else None,
            duration_ms=0,
        )
        if include_agent_logs:
            agent_logs.append(step)

    if turn.kind == "needs_user":
        return await _finalize_assistant(
            session,
            db,
            reply=turn.reply or "Could you clarify?",
            metadata={
                "chart_suggestions": turn.chart_suggestions,
                "clarification": True,
            },
            chart_suggestions=turn.chart_suggestions,
            clarification_checklist=None,
            widget_preview=None,
            agent_logs=agent_logs if include_agent_logs else None,
        )

    if turn.kind == "error" or not turn.abstract_query:
        return await _finalize_assistant(
            session,
            db,
            reply=turn.reply or CLARIFICATION_LOOP_ERROR,
            metadata={"error": True},
            chart_suggestions=[],
            clarification_checklist=None,
            widget_preview=None,
            agent_logs=agent_logs if include_agent_logs else None,
        )

    resolved_intent = turn.resolved_intent or {}
    abstract_query = turn.abstract_query
    resolved_query = translate_abstract_sql(abstract_query)
    log_agent_call(
        db,
        session_id=session_id,
        agent_name="query_translator",
        raw_query=abstract_query,
        translated_query=resolved_query,
        duration_ms=0,
    )

    timer = AgentTimer()
    try:
        data, exec_ms = execute_resolved_query(
            resolved_query,
            user_id,
            db,
            date_from=date_from,
            date_to=date_to,
            bank=bank,
        )
    except WidgetQueryExecutionError as exc:
        log_agent_call(
            db,
            session_id=session_id,
            agent_name="query_executor",
            translated_query=resolved_query,
            error=exc.internal or exc.user_message,
            duration_ms=timer.stop(),
        )
        return await _finalize_assistant(
            session,
            db,
            reply=exc.user_message,
            metadata={"error": True},
            chart_suggestions=turn.chart_suggestions,
            clarification_checklist=None,
            widget_preview=None,
            agent_logs=agent_logs if include_agent_logs else None,
        )

    log_agent_call(
        db,
        session_id=session_id,
        agent_name="query_executor",
        translated_query=resolved_query,
        execution_result={"row_count": data.get("row_count"), "success": True},
        duration_ms=exec_ms,
    )

    widget_type = str(
        resolved_intent.get("widget_type") or (turn.chart_suggestions or ["metric"])[0]
    )
    preview = _build_widget_preview(
        widget_type=widget_type,
        data=data,
        chart_config=resolved_intent.get("chart_config")
        if isinstance(resolved_intent.get("chart_config"), dict)
        else None,
    )
    raw_preview = {
        **preview,
        "abstract_query": abstract_query,
        "resolved_query": resolved_query,
        "hardcoded_filters": _hardcoded_filters_from_intent(resolved_intent),
        "intent_text": user_message.strip(),
    }
    return await _finalize_assistant(
        session,
        db,
        reply="Here is a preview of your widget. Pick a chart type or save when you are ready.",
        metadata={
            "abstract_query": abstract_query,
            "resolved_intent": resolved_intent,
            "chart_suggestions": turn.chart_suggestions,
            "clarification_checklist": turn.clarification_checklist,
        },
        chart_suggestions=turn.chart_suggestions,
        clarification_checklist=turn.clarification_checklist,
        widget_preview=_sanitize_widget_preview(
            raw_preview, include_sql=include_sql_in_preview
        ),
        agent_logs=agent_logs if include_agent_logs else None,
    )


async def _finalize_assistant(
    session: WidgetChatSession,
    db: Session,
    *,
    reply: str,
    metadata: dict[str, Any],
    chart_suggestions: list[str],
    clarification_checklist: dict[str, bool] | None,
    widget_preview: dict[str, Any] | None,
    agent_logs: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """Persist assistant message and return API payload."""
    db.add(
        WidgetChatMessage(
            id=str(uuid4()),
            session_id=session.id,
            role="assistant",
            content=reply,
            agent_name="orchestrator",
            metadata_=metadata,
        )
    )
    session.updated_at = datetime.now(UTC)
    db.commit()

    result: dict[str, Any] = {
        "reply": reply,
        "widget_preview": widget_preview,
        "chart_suggestions": chart_suggestions,
        "clarification_checklist": clarification_checklist,
    }
    if agent_logs is not None:
        result["agent_logs"] = agent_logs
    return result
