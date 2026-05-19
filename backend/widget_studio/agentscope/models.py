"""Typed state for Widget Studio AgentScope pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AgentTurnResult:
    """Result of ``run_agent_turn`` before SQL execution."""

    kind: str  # needs_user | success | error
    reply: str | None = None
    clarify_result: dict[str, Any] | None = None
    builder_result: dict[str, Any] | None = None
    resolved_intent: dict[str, Any] | None = None
    abstract_query: str | None = None
    chart_suggestions: list[str] = field(default_factory=list)
    clarification_checklist: dict[str, bool] | None = None
    agent_steps: list[dict[str, Any]] = field(default_factory=list)
