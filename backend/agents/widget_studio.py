"""Widget Studio chat pipeline — multi-turn clarification and widget suggestions."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from sqlalchemy.orm import Session

from backend.agents.nodes import (
    _build_llm,
    _extract_widget_suggestion,
)
from backend.agents.widget_studio_prompts import (
    WIDGET_STUDIO_SYSTEM_PROMPT,
    build_widget_studio_user_context,
)
from backend.models.chat_session import ChatSession
from backend.services.observability import get_callbacks
from backend.services.widget_query import validate_widget_query_config

logger = logging.getLogger(__name__)

_STUDIO_HISTORY_LIMIT = 30


def _default_draft_state() -> dict[str, Any]:
    """Return a fresh Widget Studio draft_state dict."""
    return {
        "status": "clarifying",
        "intent_summary": "",
        "pending_questions": [],
        "last_suggestion": None,
    }


def _merge_draft_after_turn(
    draft: dict[str, Any],
    *,
    widget: dict[str, Any] | None,
    user_message: str,
) -> dict[str, Any]:
    """Update draft_state after one assistant turn.

    Args:
        draft:         Existing draft_state dict.
        widget:        Parsed widget suggestion or None.
        user_message:  Latest user message (for intent summary fallback).

    Returns:
        Updated draft_state dict.
    """
    updated = dict(draft)
    if widget is not None:
        updated["status"] = "ready"
        updated["last_suggestion"] = widget
        updated["pending_questions"] = []
        title = widget.get("title") or ""
        updated["intent_summary"] = title or user_message[:120]
    else:
        updated["status"] = "clarifying"
        if not updated.get("intent_summary"):
            updated["intent_summary"] = user_message[:120]
    return updated


async def run_widget_studio_chat(
    session: ChatSession,
    user_message: str,
    db: Session,
) -> tuple[str, dict[str, Any] | None, dict[str, Any], bool]:
    """Run one Widget Studio turn: clarify or propose a widget with placeholders.

    Args:
        session:      ChatSession with session_kind widget_studio.
        user_message: Raw user text.
        db:           SQLAlchemy session.

    Returns:
        Tuple of (response_text, widget_suggestion, draft_state, clarification_only).

    Raises:
        ValueError:   If user_message is empty.
        RuntimeError: If the LLM call or persistence fails.
    """
    if not user_message or not user_message.strip():
        raise ValueError("run_widget_studio_chat: user_message must not be empty")

    now_iso = datetime.now(UTC).isoformat()
    current_messages = list(session.messages or [])
    current_messages.append(
        {
            "role": "user",
            "content": user_message.strip(),
            "timestamp": now_iso,
        }
    )

    draft_state: dict[str, Any] = dict(
        session.draft_state if session.draft_state else _default_draft_state()
    )

    recent = current_messages[-_STUDIO_HISTORY_LIMIT:]
    context = build_widget_studio_user_context(
        user_message.strip(),
        draft_state,
        recent,
    )

    llm = _build_llm()
    callbacks = get_callbacks()
    lc_messages: list[SystemMessage | HumanMessage | AIMessage] = [
        SystemMessage(content=WIDGET_STUDIO_SYSTEM_PROMPT),
    ]

    for msg in recent[:-1]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        else:
            lc_messages.append(AIMessage(content=content))

    lc_messages.append(HumanMessage(content=context))

    logger.info(
        "run_widget_studio_chat: invoking LLM session=%s user=%s",
        session.id,
        session.user_id,
    )

    try:
        response = await llm.ainvoke(
            lc_messages,
            config={"callbacks": callbacks},
        )
    except Exception as exc:
        raise RuntimeError(
            f"run_widget_studio_chat: LLM invocation failed — {exc}"
        ) from exc

    response_text = str(response.content or "").strip()
    if not response_text:
        raise RuntimeError("run_widget_studio_chat: empty LLM response")

    widget: dict[str, Any] | None = _extract_widget_suggestion(response_text)
    clarification_only = widget is None

    if widget is not None:
        try:
            validate_widget_query_config(
                str(widget.get("widget_type", "")),
                widget.get("query_config") or {},
            )
        except ValueError as exc:
            logger.warning(
                "run_widget_studio_chat: invalid widget suggestion — %s", exc
            )
            widget = None
            clarification_only = True

    draft_state = _merge_draft_after_turn(
        draft_state,
        widget=widget,
        user_message=user_message.strip(),
    )

    assistant_entry = {
        "role": "assistant",
        "content": response_text,
        "timestamp": datetime.now(UTC).isoformat(),
    }
    updated_messages = [*current_messages, assistant_entry]

    try:
        session.messages = updated_messages
        session.draft_state = draft_state
        db.add(session)
        db.commit()
        db.refresh(session)
    except Exception as exc:
        try:
            db.rollback()
        except Exception as rb_exc:
            logger.warning("run_widget_studio_chat: rollback failed: %s", rb_exc)
        raise RuntimeError(
            f"run_widget_studio_chat: failed to persist session — {exc}"
        ) from exc

    logger.info(
        "run_widget_studio_chat: done session=%s widget=%s clarify=%s",
        session.id,
        widget is not None,
        clarification_only,
    )
    return response_text, widget, draft_state, clarification_only
