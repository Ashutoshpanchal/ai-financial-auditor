"""Persist Widget Studio agent invocations to widget_agent_logs."""

from __future__ import annotations

import time
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from backend.models.widget_studio import WidgetAgentLog


def log_agent_call(
    db: Session,
    *,
    session_id: str,
    agent_name: str,
    input_data: dict[str, Any] | None = None,
    output_data: dict[str, Any] | None = None,
    raw_query: str | None = None,
    translated_query: str | None = None,
    execution_result: dict[str, Any] | None = None,
    error: str | None = None,
    duration_ms: int | None = None,
) -> WidgetAgentLog:
    """Write one agent log row (no raw transaction data)."""
    row = WidgetAgentLog(
        id=str(uuid4()),
        session_id=session_id,
        agent_name=agent_name,
        input=input_data,
        output=output_data,
        raw_query=raw_query,
        translated_query=translated_query,
        execution_result=execution_result,
        error=error,
        duration_ms=duration_ms,
    )
    db.add(row)
    return row


class AgentTimer:
    """Context helper to measure agent duration_ms."""

    def __init__(self) -> None:
        self._start = time.monotonic()
        self.duration_ms: int = 0

    def stop(self) -> int:
        """Stop timer and return elapsed milliseconds."""
        self.duration_ms = int((time.monotonic() - self._start) * 1000)
        return self.duration_ms
