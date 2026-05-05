"""Chat router — FastAPI endpoints for managing chat sessions and sending messages.

Endpoints:
    POST   /chat/sessions                        Create a new chat session.
    POST   /chat/sessions/{session_id}/message   Send a message to an existing session.
    GET    /chat/sessions                        List all sessions for the current user.
    GET    /chat/sessions/{session_id}           Retrieve a session with its full history.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.agents.chat import run_chat
from backend.database import get_db
from backend.middleware.auth import get_current_user
from backend.models.chat_session import ChatSession
from backend.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class CreateSessionRequest(BaseModel):
    """Request body for creating a new chat session."""

    title: str | None = None


class CreateSessionResponse(BaseModel):
    """Response body returned when a session is created."""

    id: str
    title: str | None
    created_at: datetime


class SendMessageRequest(BaseModel):
    """Request body for sending a message to an existing session."""

    content: str


class SendMessageResponse(BaseModel):
    """Response body returned after the agent processes a message."""

    response: str
    session_id: str


class SessionSummary(BaseModel):
    """Lightweight session item used in the list endpoint."""

    id: str
    title: str | None
    message_count: int
    updated_at: datetime


class SessionDetail(BaseModel):
    """Full session record including complete message history."""

    id: str
    title: str | None
    messages: list[dict]
    created_at: datetime


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/sessions",
    response_model=CreateSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new chat session",
)
async def create_session(
    body: CreateSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CreateSessionResponse:
    """Create a new chat session for the authenticated user.

    Args:
        body:         Optional title for the session.
        current_user: Injected by get_current_user dependency.
        db:           Injected SQLAlchemy session.

    Returns:
        The newly created session's id, title, and created_at timestamp.
    """
    session = ChatSession(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title=body.title,
        messages=[],
    )
    db.add(session)
    try:
        db.commit()
        db.refresh(session)
    except Exception as exc:
        db.rollback()
        logger.exception("create_session: failed to persist session for user=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create chat session.",
        ) from exc

    logger.info("create_session: created session=%s for user=%s", session.id, current_user.id)
    return CreateSessionResponse(
        id=session.id,
        title=session.title,
        created_at=session.created_at,
    )


@router.post(
    "/sessions/{session_id}/message",
    response_model=SendMessageResponse,
    summary="Send a message to an existing chat session",
)
async def send_message(
    session_id: str,
    body: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SendMessageResponse:
    """Send a user message to the finance agent and receive a response.

    Loads the session, verifies ownership, runs the LangGraph agent pipeline,
    and returns the agent's reply.

    Args:
        session_id:   Path parameter — the target session's UUID.
        body:         Message content string.
        current_user: Injected authenticated user.
        db:           Injected SQLAlchemy session.

    Returns:
        The agent's response string and the session id.

    Raises:
        HTTPException 404: If the session does not exist or belongs to another user.
        HTTPException 422: If the message content is empty.
        HTTPException 500: If the agent pipeline fails.
    """
    if not body.content or not body.content.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message content must not be empty.",
        )

    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
        .first()
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat session '{session_id}' not found.",
        )

    logger.info(
        "send_message: user=%s session=%s content_length=%d",
        current_user.id,
        session_id,
        len(body.content),
    )

    try:
        response_text = await run_chat(session, body.content, db)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        logger.exception(
            "send_message: agent pipeline failed for session=%s user=%s",
            session_id,
            current_user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Agent pipeline error: {exc}",
        ) from exc

    return SendMessageResponse(response=response_text, session_id=session_id)


@router.get(
    "/sessions",
    response_model=list[SessionSummary],
    summary="List all chat sessions for the current user",
)
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SessionSummary]:
    """Return a list of all chat sessions belonging to the authenticated user.

    Each item includes id, title, message count, and the last-updated timestamp.

    Args:
        current_user: Injected authenticated user.
        db:           Injected SQLAlchemy session.

    Returns:
        List of SessionSummary objects ordered by updated_at descending.
    """
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
        .all()
    )

    return [
        SessionSummary(
            id=s.id,
            title=s.title,
            message_count=len(s.messages or []),
            updated_at=s.updated_at,
        )
        for s in sessions
    ]


@router.get(
    "/sessions/{session_id}",
    response_model=SessionDetail,
    summary="Get a chat session with full message history",
)
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionDetail:
    """Retrieve a single chat session including its complete message history.

    Args:
        session_id:   Path parameter — the target session's UUID.
        current_user: Injected authenticated user.
        db:           Injected SQLAlchemy session.

    Returns:
        Full SessionDetail including all messages.

    Raises:
        HTTPException 404: If the session does not exist or belongs to another user.
    """
    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
        .first()
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat session '{session_id}' not found.",
        )

    return SessionDetail(
        id=session.id,
        title=session.title,
        messages=session.messages or [],
        created_at=session.created_at,
    )
