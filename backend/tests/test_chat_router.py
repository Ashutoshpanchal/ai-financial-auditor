"""Tests for chat session delete and safe error responses."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.database import get_db
from backend.middleware.auth import get_current_user
from backend.models.chat_session import ChatSession
from backend.routers.chat import router as chat_router

_chat_app = FastAPI()
_chat_app.include_router(chat_router)


def _client(db: MagicMock, user: MagicMock) -> TestClient:
    """TestClient with auth and DB overrides."""
    _chat_app.dependency_overrides[get_db] = lambda: db
    _chat_app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(_chat_app, raise_server_exceptions=True)


@pytest.fixture
def user() -> MagicMock:
    """Authenticated user mock."""
    u = MagicMock()
    u.id = "user-1"
    return u


@pytest.fixture
def db() -> MagicMock:
    """SQLAlchemy session mock."""
    return MagicMock()


class TestDeleteSession:
    """DELETE /chat/sessions/{session_id}."""

    def test_delete_session_returns_204(self, db: MagicMock, user: MagicMock) -> None:
        """Owned session is deleted and returns no content."""
        session = ChatSession(
            id="sess-del",
            user_id="user-1",
            title="Test",
            session_kind="widget_studio",
            messages=[],
        )
        db.query.return_value.filter.return_value.first.return_value = session

        client = _client(db, user)
        res = client.delete("/chat/sessions/sess-del")

        assert res.status_code == 204
        db.delete.assert_called_once_with(session)
        db.commit.assert_called_once()

    def test_delete_missing_session_returns_404(
        self, db: MagicMock, user: MagicMock
    ) -> None:
        """Unknown session returns 404."""
        db.query.return_value.filter.return_value.first.return_value = None
        client = _client(db, user)
        res = client.delete("/chat/sessions/missing")
        assert res.status_code == 404


class TestSendMessageSafeErrors:
    """POST /chat/sessions/{id}/message must not leak internal errors."""

    def test_runtime_error_returns_generic_detail(
        self, db: MagicMock, user: MagicMock
    ) -> None:
        """Agent failures return a safe message, not SQL internals."""
        session = ChatSession(
            id="sess-1",
            user_id="user-1",
            title="Studio",
            session_kind="widget_studio",
            messages=[],
        )
        db.query.return_value.filter.return_value.first.return_value = session

        with patch(
            "backend.routers.chat.run_chat",
            new_callable=AsyncMock,
            side_effect=RuntimeError(
                "syntax error at or near AND FROM transactions.user_id"
            ),
        ):
            client = _client(db, user)
            res = client.post(
                "/chat/sessions/sess-1/message",
                json={"content": "build widget"},
            )

        assert res.status_code == 500
        detail = res.json()["detail"]
        assert "transactions" not in detail.lower()
        assert "syntax error" not in detail.lower()
