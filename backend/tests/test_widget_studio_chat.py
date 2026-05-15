"""Tests for Widget Studio chat routing and draft_state."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.agents.chat import run_chat
from backend.models.chat_session import ChatSession


@pytest.mark.asyncio
async def test_run_chat_widget_studio_delegates() -> None:
    """widget_studio sessions use run_widget_studio_chat instead of the general graph."""
    session = ChatSession(
        id="sess-1",
        user_id="user-1",
        title="Studio",
        session_kind="widget_studio",
        messages=[],
        draft_state=None,
    )
    db = MagicMock()

    with patch(
        "backend.agents.chat.run_widget_studio_chat",
        new_callable=AsyncMock,
        return_value=("Hello", None, {"status": "clarifying"}, True),
    ) as mock_studio:
        text, widget, draft, clarify = await run_chat(session, "build a chart", db)

    mock_studio.assert_awaited_once()
    assert text == "Hello"
    assert widget is None
    assert draft == {"status": "clarifying"}
    assert clarify is True
