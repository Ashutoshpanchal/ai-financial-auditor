"""Tests for backend.agents.nodes — LangGraph node functions."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.agents.nodes import (
    AgentState,
    _build_llm,
    _last_user_message,
    intake_node,
    response_node,
)

# ---------------------------------------------------------------------------
# _build_llm
# ---------------------------------------------------------------------------


class TestBuildLlm:
    """Tests for the _build_llm helper."""

    @patch("backend.agents.nodes.ChatOpenAI")
    @patch("backend.agents.nodes.get_settings")
    def test_build_llm_returns_instance(self, mock_settings, mock_llm_cls):
        """_build_llm should return a ChatOpenAI instance."""
        mock_settings.return_value = MagicMock(
            openrouter_model="test-model",
            openrouter_api_key="test-key",
            openrouter_base_url="https://test.url",
        )
        mock_llm_cls.return_value = MagicMock()

        result = _build_llm()

        assert result is not None
        mock_llm_cls.assert_called_once()


# ---------------------------------------------------------------------------
# _last_user_message
# ---------------------------------------------------------------------------


class TestLastUserMessage:
    """Tests for the _last_user_message helper."""

    def test_returns_last_user_message(self):
        """Should return the content of the most recent user message."""
        messages = [
            {"role": "user", "content": "first"},
            {"role": "assistant", "content": "reply"},
            {"role": "user", "content": "second"},
        ]
        assert _last_user_message(messages) == "second"

    def test_returns_none_when_no_user_messages(self):
        """Should return None when there are no user messages."""
        messages = [{"role": "assistant", "content": "reply"}]
        assert _last_user_message(messages) is None

    def test_returns_none_for_empty_list(self):
        """Should return None for an empty message list."""
        assert _last_user_message([]) is None


# ---------------------------------------------------------------------------
# intake_node
# ---------------------------------------------------------------------------


class TestIntakeNode:
    """Tests for the intake_node graph node."""

    @pytest.fixture
    def base_state(self) -> AgentState:
        return {
            "messages": [
                {
                    "role": "user",
                    "content": "Show me my spending summary",
                    "timestamp": "T1",
                }
            ],
            "user_id": "user-123",
            "session_id": "sess-456",
            "tool_calls": [],
            "tool_results": [],
            "final_response": "",
        }

    @patch("backend.agents.nodes.get_callbacks")
    @patch("backend.agents.nodes._build_llm")
    @pytest.mark.asyncio
    async def test_intake_node_spending_summary_intent(
        self, mock_llm, mock_callbacks, base_state
    ):
        """intake_node should classify spending_summary intent and set tool_calls."""
        mock_callbacks.return_value = []
        mock_response = MagicMock()
        mock_response.content = '{"intent": "spending_summary", "query": null, "month1": null, "month2": null}'
        mock_llm.return_value.ainvoke = AsyncMock(return_value=mock_response)

        result = await intake_node(base_state)

        assert len(result["tool_calls"]) == 1
        assert result["tool_calls"][0]["tool"] == "get_spending_summary"

    @patch("backend.agents.nodes.get_callbacks")
    @patch("backend.agents.nodes._build_llm")
    @pytest.mark.asyncio
    async def test_intake_node_search_transactions_intent(
        self, mock_llm, mock_callbacks, base_state
    ):
        """intake_node should classify search_transactions intent."""
        mock_callbacks.return_value = []
        mock_response = MagicMock()
        mock_response.content = '{"intent": "search_transactions", "query": "coffee shops", "month1": null, "month2": null}'
        mock_llm.return_value.ainvoke = AsyncMock(return_value=mock_response)

        result = await intake_node(base_state)

        assert result["tool_calls"][0]["tool"] == "search_transactions"
        assert result["tool_calls"][0]["query"] == "coffee shops"

    @patch("backend.agents.nodes.get_callbacks")
    @patch("backend.agents.nodes._build_llm")
    @pytest.mark.asyncio
    async def test_intake_node_compare_months_intent(
        self, mock_llm, mock_callbacks, base_state
    ):
        """intake_node should classify compare_months intent."""
        mock_callbacks.return_value = []
        mock_response = MagicMock()
        mock_response.content = '{"intent": "compare_months", "query": null, "month1": "2024-01", "month2": "2024-02"}'
        mock_llm.return_value.ainvoke = AsyncMock(return_value=mock_response)

        result = await intake_node(base_state)

        assert result["tool_calls"][0]["tool"] == "compare_months"
        assert result["tool_calls"][0]["month1"] == "2024-01"
        assert result["tool_calls"][0]["month2"] == "2024-02"

    @pytest.mark.asyncio
    async def test_intake_node_no_user_message_raises(self):
        """intake_node should raise ValueError when no user message exists."""
        state: AgentState = {
            "messages": [{"role": "assistant", "content": "hi"}],
            "user_id": "user-123",
            "session_id": "sess-456",
            "tool_calls": [],
            "tool_results": [],
            "final_response": "",
        }
        with pytest.raises(ValueError, match="no user message"):
            await intake_node(state)


# ---------------------------------------------------------------------------
# response_node
# ---------------------------------------------------------------------------


class TestResponseNode:
    """Tests for the response_node graph node."""

    @pytest.fixture
    def state_with_response(self) -> AgentState:
        return {
            "messages": [
                {"role": "user", "content": "Show spending", "timestamp": "T1"}
            ],
            "user_id": "user-123",
            "session_id": "sess-456",
            "tool_calls": [],
            "tool_results": [],
            "final_response": "Your spending summary is...",
        }

    @pytest.mark.asyncio
    async def test_response_node_appends_assistant_message(self, state_with_response):
        """response_node should append the assistant response to messages."""
        result = await response_node(state_with_response)

        assert len(result["messages"]) == 2  # user + assistant
        assert result["messages"][-1]["role"] == "assistant"
        assert result["messages"][-1]["content"] == "Your spending summary is..."

    @pytest.mark.asyncio
    async def test_response_node_preserves_existing_messages(self, state_with_response):
        """response_node should not lose existing messages."""
        result = await response_node(state_with_response)

        assert result["messages"][0]["content"] == "Show spending"
