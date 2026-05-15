"""ChatSession model — persists LangGraph multi-agent conversation history."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base


class ChatSession(Base):
    """One session per user conversation thread with the finance agent."""

    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    session_kind: Mapped[str] = mapped_column(
        String,
        nullable=False,
        server_default="general",
        default="general",
    )
    # Full message history as [{role, content, timestamp}]
    messages: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # Widget Studio: {status, intent_summary, pending_questions, last_suggestion}
    draft_state: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
