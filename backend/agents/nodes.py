"""LangGraph node functions for the AI Finance Agent.

Each node is an async function that accepts and returns AgentState.
The graph is assembled in chat.py; nodes focus purely on their single responsibility.

Node pipeline:
    intake_node → rag_node → analysis_node → response_node
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from sqlalchemy.orm import Session
from typing_extensions import TypedDict

from backend.agents.tools import (
    compare_months,
    get_anomalies,
    get_spending_summary,
    search_transactions,
)
from backend.config import get_settings
from backend.services.observability import get_callbacks

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# State definition
# ---------------------------------------------------------------------------


class AgentState(TypedDict):
    """Shared state passed between LangGraph nodes.

    Attributes:
        messages:       Full conversation history as list of {role, content, timestamp}.
        user_id:        ID of the authenticated user owning this session.
        session_id:     ID of the ChatSession record in the database.
        tool_calls:     Pending tool-call descriptors set by intake_node / rag_node.
        tool_results:   Collected tool outputs, each {tool, result}.
        final_response: The assistant's final answer string, set by response_node.
    """

    messages: list[dict]
    user_id: str
    session_id: str
    tool_calls: list[dict]
    tool_results: list[dict]
    final_response: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_INTENT_SYSTEM_PROMPT = """\
You are an intent-extraction assistant for a personal finance auditor.
Given a user message, respond with a JSON object (no markdown fences) that has:
  - "intent": one of ["search_transactions", "spending_summary", "compare_months",
                       "get_anomalies", "general"]
  - "query": the cleaned search phrase if intent is "search_transactions", else null
  - "month1": YYYY-MM string if intent is "compare_months", else null
  - "month2": YYYY-MM string if intent is "compare_months", else null
Respond ONLY with the JSON object. No extra text.
"""

_ANALYSIS_SYSTEM_PROMPT = """\
You are an expert AI personal finance auditor. Using the transaction data provided,
give a clear, accurate, and actionable insight. Be concise but thorough.
If the data is empty, say so honestly. Never fabricate numbers.
"""


def _build_llm() -> ChatOpenAI:
    """Build a ChatOpenAI client pointed at OpenRouter using settings from config.

    Returns:
        Configured ChatOpenAI instance.
    """
    settings = get_settings()
    return ChatOpenAI(
        model=settings.openrouter_model,
        openai_api_key=settings.openrouter_api_key,
        openai_api_base=settings.openrouter_base_url,
        temperature=0.2,
        max_tokens=2048,
    )


def _last_user_message(messages: list[dict]) -> str | None:
    """Return the content of the most recent user message in the history.

    Args:
        messages: Conversation history list.

    Returns:
        Content string of the last user message, or None if not found.
    """
    for msg in reversed(messages):
        if msg.get("role") == "user":
            return msg.get("content")
    return None


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------


async def intake_node(state: AgentState) -> AgentState:
    """Validate the latest user message and extract structured intent.

    Reads the last user message from state.messages, calls the LLM to classify
    the intent, and populates state.tool_calls with the appropriate tool descriptor.

    Args:
        state: Current graph state.

    Returns:
        Updated state with tool_calls populated based on extracted intent.

    Raises:
        ValueError: If no user message is found in the conversation history.
    """
    user_message = _last_user_message(state["messages"])
    if not user_message:
        raise ValueError("intake_node: no user message found in conversation history")

    logger.info(
        "intake_node: processing message for user=%s session=%s",
        state["user_id"],
        state["session_id"],
    )

    llm = _build_llm()
    callbacks = get_callbacks()

    try:
        response = await llm.ainvoke(
            [
                SystemMessage(content=_INTENT_SYSTEM_PROMPT),
                HumanMessage(content=user_message),
            ],
            config={"callbacks": callbacks},
        )
    except Exception as exc:
        raise RuntimeError(
            f"intake_node: LLM intent extraction failed — {exc}"
        ) from exc

    raw = response.content.strip()
    # Strip accidental markdown fences if the model adds them
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        intent_data: dict = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning(
            "intake_node: could not parse LLM intent JSON — falling back to general. raw=%s",
            raw[:200],
        )
        intent_data = {
            "intent": "general",
            "query": user_message,
            "month1": None,
            "month2": None,
        }

    tool_calls: list[dict] = []
    intent = intent_data.get("intent", "general")

    if intent == "search_transactions":
        tool_calls.append(
            {
                "tool": "search_transactions",
                "query": intent_data.get("query") or user_message,
            }
        )
    elif intent == "spending_summary":
        tool_calls.append({"tool": "get_spending_summary"})
    elif intent == "compare_months":
        tool_calls.append(
            {
                "tool": "compare_months",
                "month1": intent_data.get("month1"),
                "month2": intent_data.get("month2"),
            }
        )
    elif intent == "get_anomalies":
        tool_calls.append({"tool": "get_anomalies"})
    else:
        # General question — still run a search to surface relevant context
        tool_calls.append(
            {
                "tool": "search_transactions",
                "query": user_message,
            }
        )

    logger.info("intake_node: resolved intent=%s tool_calls=%s", intent, tool_calls)
    return {**state, "tool_calls": tool_calls, "tool_results": []}


async def rag_node(state: AgentState, db: Session) -> AgentState:
    """Execute the tool(s) identified by intake_node and collect results.

    Iterates over state.tool_calls, invokes the appropriate LangChain tool
    for the current user, and appends each result to state.tool_results.

    Args:
        state: Current graph state with populated tool_calls.
        db:    SQLAlchemy session used by the tools.

    Returns:
        Updated state with tool_results populated.

    Raises:
        RuntimeError: If a tool invocation raises an unrecoverable error.
    """
    user_id = state["user_id"]
    results: list[dict] = []

    for call in state["tool_calls"]:
        tool_name = call.get("tool")
        logger.info("rag_node: invoking tool=%s for user=%s", tool_name, user_id)

        try:
            if tool_name == "search_transactions":
                result = search_transactions(
                    query=call.get("query", ""),
                    user_id=user_id,
                    db=db,
                )
            elif tool_name == "get_spending_summary":
                result = get_spending_summary(user_id=user_id, db=db)
            elif tool_name == "compare_months":
                month1 = call.get("month1") or ""
                month2 = call.get("month2") or ""
                if not month1 or not month2:
                    result = (
                        "Could not compare months: both month1 and month2 must be provided "
                        "in YYYY-MM format. Please specify which months to compare."
                    )
                else:
                    result = compare_months(
                        month1=month1,
                        month2=month2,
                        user_id=user_id,
                        db=db,
                    )
            elif tool_name == "get_anomalies":
                result = get_anomalies(user_id=user_id, db=db)
            else:
                result = f"Unknown tool '{tool_name}' — skipping."
                logger.warning("rag_node: unknown tool '%s'", tool_name)

        except ValueError as exc:
            result = f"Tool {tool_name} received invalid input: {exc}"
            logger.warning("rag_node: ValueError from tool %s — %s", tool_name, exc)
        except RuntimeError as exc:
            result = f"Tool {tool_name} encountered an error: {exc}"
            logger.error("rag_node: RuntimeError from tool %s — %s", tool_name, exc)
        except Exception as exc:
            # Catch-all so one tool failure doesn't abort the whole graph
            result = f"Tool {tool_name} failed unexpectedly: {exc}"
            logger.exception("rag_node: unexpected error from tool %s", tool_name)

        results.append({"tool": tool_name, "result": result})

    return {**state, "tool_results": results}


async def analysis_node(state: AgentState) -> AgentState:
    """Call the LLM to synthesise tool outputs into a coherent financial insight.

    Builds a prompt that includes the user's question and all tool results, then
    invokes the LLM to produce an analytical response.

    Args:
        state: Current graph state with populated tool_results.

    Returns:
        Updated state with final_response set to the LLM's analysis.

    Raises:
        RuntimeError: If the LLM call fails.
    """
    user_message = _last_user_message(state["messages"]) or ""
    callbacks = get_callbacks()
    llm = _build_llm()

    # Compose the context block from tool results
    context_parts: list[str] = []
    for entry in state["tool_results"]:
        context_parts.append(f"[{entry['tool']} output]\n{entry['result']}")

    context_text = "\n\n".join(context_parts) if context_parts else "No data retrieved."

    # Build message history for the LLM — include last 10 prior turns for continuity
    recent_history = state["messages"][-10:] if len(state["messages"]) > 1 else []
    lc_messages = [SystemMessage(content=_ANALYSIS_SYSTEM_PROMPT)]

    for msg in recent_history[:-1]:  # exclude the current user message (added below)
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        else:
            from langchain_core.messages import AIMessage

            lc_messages.append(AIMessage(content=content))

    # Final user turn includes the retrieved context
    user_prompt = (
        f"User question: {user_message}\n\n"
        f"Retrieved financial data:\n{context_text}\n\n"
        "Please provide a clear, accurate financial analysis."
    )
    lc_messages.append(HumanMessage(content=user_prompt))

    logger.info(
        "analysis_node: invoking LLM for user=%s session=%s",
        state["user_id"],
        state["session_id"],
    )

    try:
        response = await llm.ainvoke(
            lc_messages,
            config={"callbacks": callbacks},
        )
    except Exception as exc:
        raise RuntimeError(f"analysis_node: LLM invocation failed — {exc}") from exc

    return {**state, "final_response": response.content}


async def response_node(state: AgentState) -> AgentState:
    """Format the final response and append both turns to the message history.

    Appends the current user message and the assistant's final_response to
    state.messages so the session history stays up to date.

    Args:
        state: Current graph state with final_response set.

    Returns:
        Updated state with messages extended by the new user + assistant turns.
    """
    now_iso = datetime.now(UTC).isoformat()
    _last_user_message(state["messages"]) or ""

    # The user message is already in state["messages"]; add the assistant reply
    assistant_entry = {
        "role": "assistant",
        "content": state["final_response"],
        "timestamp": now_iso,
    }

    updated_messages = [*list(state["messages"]), assistant_entry]

    logger.info(
        "response_node: response ready for user=%s session=%s len(messages)=%d",
        state["user_id"],
        state["session_id"],
        len(updated_messages),
    )

    return {**state, "messages": updated_messages}
