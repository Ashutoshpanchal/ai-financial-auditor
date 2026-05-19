"""Tests for AgentScope JSON parse logging and errors."""

from __future__ import annotations

import pytest

from backend.widget_studio.agentscope.json_parse import (
    AgentJsonParseError,
    _text_from_content_block,
    extract_text_from_response,
    parse_json_response,
)


class _FakeChatResponse:
    """Minimal stand-in for AgentScope ``ChatResponse``."""

    def __init__(self, content: list) -> None:
        self.content = content


def test_text_from_dict_block() -> None:
    """AgentScope OpenAI blocks are dicts with a text field."""
    block = {"type": "text", "text": '{"status": "ready"}'}
    assert _text_from_content_block(block) == '{"status": "ready"}'


def test_extract_text_from_dict_blocks() -> None:
    """extract_text_from_response reads dict-shaped content blocks."""
    resp = _FakeChatResponse([{"type": "text", "text": "hello"}])
    assert extract_text_from_response(resp) == "hello"  # type: ignore[arg-type]


def test_parse_json_response_valid_fence() -> None:
    """Markdown JSON fence is stripped before parse."""
    raw = '```json\n{"status": "ready"}\n```'
    assert parse_json_response(raw, agent_name="test") == {"status": "ready"}


def test_parse_json_response_empty_raises_with_details() -> None:
    """Empty model text raises AgentJsonParseError with agent and reason."""
    with pytest.raises(AgentJsonParseError, match="empty"):
        parse_json_response(
            "   ",
            agent_name="clarification",
            model_info={"model": "test-model", "base_url": "https://example"},
        )
    try:
        parse_json_response("   ", agent_name="clarification")
    except AgentJsonParseError as exc:
        assert exc.details["agent"] == "clarification"
        assert exc.details["reason"] == "empty_model_text"


def test_parse_json_response_invalid_json_raises() -> None:
    """Non-JSON text includes decode context in the error message."""
    with pytest.raises(AgentJsonParseError, match="valid JSON"):
        parse_json_response("not json at all", agent_name="query_builder")
