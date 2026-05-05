"""LangGraph StateGraph for the AI Finance Agent.

Builds and compiles the multi-node graph:
    intake_node → rag_node → analysis_node → response_node → END

The compiled graph is exported as `finance_graph`.
The public entry point for callers is `run_chat()`.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from functools import partial
from typing import Any

from langgraph.graph import END, StateGraph
from sqlalchemy.orm import Session

from backend.agents.nodes import (
    AgentState,
    analysis_node,
    intake_node,
    rag_node,
    response_node,
)
from backend.models.chat_session import ChatSession

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------


def _build_graph(db: Session) -> Any:
    """Construct and compile the LangGraph StateGraph for the finance agent.

    The rag_node requires a database session, so the graph is compiled fresh
    per request with `db` bound via functools.partial.

    Args:
        db: SQLAlchemy session to inject into rag_node.

    Returns:
        Compiled LangGraph runnable (CompiledGraph).
    """
    graph = StateGraph(AgentState)

    # Bind the db session into rag_node via partial so it matches the node signature
    rag_with_db = partial(rag_node, db=db)

    graph.add_node("intake_node", intake_node)
    graph.add_node("rag_node", rag_with_db)
    graph.add_node("analysis_node", analysis_node)
    graph.add_node("response_node", response_node)

    graph.set_entry_point("intake_node")

    graph.add_edge("intake_node", "rag_node")
    graph.add_edge("rag_node", "analysis_node")
    graph.add_edge("analysis_node", "response_node")
    graph.add_edge("response_node", END)

    return graph.compile()


# Module-level compiled graph — uses a placeholder db; callers should use run_chat()
# which builds a fresh graph with the real session.  This export exists so that
# tooling that imports `finance_graph` directly can introspect the graph topology
# without a live database.
#
# NOTE: Do NOT invoke `finance_graph` directly in production code — always call
#       `run_chat()` which supplies the correct db session.
finance_graph = StateGraph(AgentState)
finance_graph.add_node("intake_node", intake_node)
finance_graph.add_node("rag_node", rag_node)
finance_graph.add_node("analysis_node", analysis_node)
finance_graph.add_node("response_node", response_node)
finance_graph.set_entry_point("intake_node")
finance_graph.add_edge("intake_node", "rag_node")
finance_graph.add_edge("rag_node", "analysis_node")
finance_graph.add_edge("analysis_node", "response_node")
finance_graph.add_edge("response_node", END)
finance_graph = finance_graph.compile()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def run_chat(session: ChatSession, user_message: str, db: Session) -> str:
    """Run the finance agent graph for one user turn and persist the updated history.

    Steps:
      1. Append the new user message to the session's existing history.
      2. Build the initial AgentState from session data.
      3. Invoke the compiled LangGraph with that state.
      4. Persist the updated messages (including the assistant reply) back to the session.
      5. Return the assistant's final_response string.

    Args:
        session:      ChatSession ORM object for the current conversation.
        user_message: Raw text sent by the user in this turn.
        db:           SQLAlchemy session (caller manages the transaction lifecycle).

    Returns:
        The assistant's response string.

    Raises:
        ValueError:   If user_message is empty.
        RuntimeError: If the graph invocation fails.
    """
    if not user_message or not user_message.strip():
        raise ValueError("run_chat: user_message must not be empty")

    now_iso = datetime.now(UTC).isoformat()

    # Clone existing messages so we don't mutate the ORM object before commit
    current_messages = list(session.messages or [])
    current_messages.append(
        {
            "role": "user",
            "content": user_message.strip(),
            "timestamp": now_iso,
        }
    )

    initial_state: AgentState = {
        "messages": current_messages,
        "user_id": session.user_id,
        "session_id": str(session.id),
        "tool_calls": [],
        "tool_results": [],
        "final_response": "",
    }

    logger.info(
        "run_chat: starting graph for session=%s user=%s",
        session.id,
        session.user_id,
    )

    # Build a graph instance with the real db session bound to rag_node
    compiled = _build_graph(db)

    try:
        final_state: AgentState = await compiled.ainvoke(initial_state)
    except Exception as exc:
        raise RuntimeError(f"run_chat: graph invocation failed — {exc}") from exc

    # Persist the full updated message history (includes the new assistant turn)
    session.messages = final_state["messages"]
    db.add(session)
    db.commit()
    db.refresh(session)

    response_text = final_state.get("final_response", "")
    if not response_text:
        raise RuntimeError("run_chat: graph completed but final_response is empty")

    logger.info(
        "run_chat: completed for session=%s response_length=%d",
        session.id,
        len(response_text),
    )
    return response_text
