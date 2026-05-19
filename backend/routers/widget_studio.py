"""Widget Studio API — sessions, messages, saved widgets, super-admin debug."""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.database import get_db
from backend.middleware.auth import get_current_user, require_super_admin
from backend.models.user import User, UserRole
from backend.models.widget_studio import (
    WidgetAgentLog,
    WidgetChatMessage,
    WidgetChatSession,
    WidgetDefinition,
)
from backend.services.widget_studio_dashboard import add_studio_widget_to_dashboard
from backend.services.widget_studio_rate_limit import (
    WidgetStudioRateLimited,
    check_widget_studio_message_rate_limit,
)
from backend.widget_studio.broken_widget import (
    mark_widget_broken_if_needed,
    widget_broken_response,
)
from backend.widget_studio.orchestrator import run_widget_studio_turn
from backend.widget_studio.query_executor import (
    WidgetQueryExecutionError,
    execute_resolved_query,
)
from backend.widget_studio.query_translator import translate_abstract_sql
from backend.widget_studio.vocabulary import WIDGET_BROKEN_MESSAGE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/widget-studio", tags=["widget-studio"])


class CreateSessionResponse(BaseModel):
    """New Widget Studio session."""

    id: str
    title: str | None
    created_at: datetime


class SessionSummary(BaseModel):
    """Session list item."""

    id: str
    title: str | None
    created_at: datetime
    widget_id: str | None
    message_count: int


class MessageItem(BaseModel):
    """Chat message in a session."""

    id: str
    role: str
    content: str
    agent_name: str | None
    metadata: dict[str, Any] | None
    created_at: datetime


class MessageFilters(BaseModel):
    """Dashboard filters applied per message (not saved on widget)."""

    date_from: date | None = None
    date_to: date | None = None
    bank: str | None = None
    banks: list[str] = Field(default_factory=list)
    parent_category: str | None = None
    sub_categories: list[str] = Field(default_factory=list)


class SendMessageRequest(BaseModel):
    """User message + session-level filters."""

    message: str
    filters: MessageFilters = Field(default_factory=MessageFilters)


class SendMessageResponse(BaseModel):
    """Orchestrator response."""

    reply: str
    widget_preview: dict[str, Any] | None = None
    chart_suggestions: list[str] = Field(default_factory=list)
    clarification_checklist: dict[str, bool] | None = None
    agent_logs: list[dict[str, Any]] | None = None


class SaveWidgetRequest(BaseModel):
    """Persist a widget definition."""

    session_id: str
    name: str
    type: str
    intent_text: str
    abstract_query: str
    resolved_query: str = ""
    hardcoded_filters: dict[str, Any] | None = None
    chart_config: dict[str, Any] | None = None


class RenameWidgetRequest(BaseModel):
    """Rename a saved widget."""

    name: str


class AddToDashboardRequest(BaseModel):
    """Add a saved Widget Studio definition to the main dashboard."""

    col_span: int = Field(default=1, ge=1, le=3)


class WidgetSummary(BaseModel):
    """Saved widget list item."""

    id: str
    name: str
    type: str
    created_at: datetime
    broken: bool = False


class RenderWidgetResponse(BaseModel):
    """Widget render result."""

    data: dict[str, Any] | None = None
    error: str | None = None
    message: str | None = None
    executed_query: str | None = None
    resolved_query_template: str | None = None


class PreviewExecuteRequest(BaseModel):
    """Re-run a draft widget SQL template with dashboard filters."""

    resolved_query: str
    date_from: date | None = None
    date_to: date | None = None
    bank: str | None = None
    banks: list[str] = Field(default_factory=list)
    parent_category: str | None = None
    sub_categories: list[str] = Field(default_factory=list)


def _coerce_widget_studio_filters(
    *,
    date_from: date | None,
    date_to: date | None,
    bank: str | None,
    banks: list[str] | None,
    parent_category: str | None,
    sub_categories: list[str] | None,
) -> dict[str, Any]:
    """Normalise FilterBar values for query execution."""
    effective_banks = [b.strip() for b in (banks or []) if b and b.strip()]
    if bank and bank.strip():
        if bank.strip() not in effective_banks:
            effective_banks = [bank.strip(), *effective_banks]
    subs = [s.strip() for s in (sub_categories or []) if s and s.strip()]
    pc = (
        parent_category.strip() if parent_category and parent_category.strip() else None
    )
    return {
        "date_from": date_from,
        "date_to": date_to,
        "bank": bank.strip() if bank and bank.strip() else None,
        "banks": effective_banks or None,
        "parent_category": pc,
        "sub_categories": subs or None,
    }


def _get_owned_session(session_id: str, user_id: str, db: Session) -> WidgetChatSession:
    """Load session or raise 404."""
    session = db.get(WidgetChatSession, session_id)
    if session is None or session.is_deleted or session.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Session not found.")
    return session


@router.post(
    "/sessions",
    response_model=CreateSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CreateSessionResponse:
    """Create a new Widget Studio chat session."""
    if not get_settings().widget_studio_enabled:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, detail="Widget Studio is disabled."
        )

    session = WidgetChatSession(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title="New widget",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return CreateSessionResponse(
        id=session.id, title=session.title, created_at=session.created_at
    )


@router.get("/sessions", response_model=list[SessionSummary])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SessionSummary]:
    """List Widget Studio sessions for the current user."""
    sessions = db.scalars(
        select(WidgetChatSession)
        .where(
            WidgetChatSession.user_id == current_user.id,
            WidgetChatSession.is_deleted.is_(False),
        )
        .order_by(WidgetChatSession.updated_at.desc())
    ).all()

    out: list[SessionSummary] = []
    for sess in sessions:
        count = db.scalar(
            select(func.count())
            .select_from(WidgetChatMessage)
            .where(WidgetChatMessage.session_id == sess.id)
        )
        out.append(
            SessionSummary(
                id=sess.id,
                title=sess.title,
                created_at=sess.created_at,
                widget_id=sess.widget_id,
                message_count=int(count or 0),
            )
        )
    return out


@router.get("/sessions/{session_id}/messages", response_model=list[MessageItem])
async def list_messages(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MessageItem]:
    """Return all messages in a session."""
    _get_owned_session(session_id, current_user.id, db)
    messages = db.scalars(
        select(WidgetChatMessage)
        .where(WidgetChatMessage.session_id == session_id)
        .order_by(WidgetChatMessage.created_at)
    ).all()
    return [
        MessageItem(
            id=m.id,
            role=m.role,
            content=m.content,
            agent_name=m.agent_name,
            metadata=m.metadata_,
            created_at=m.created_at,
        )
        for m in messages
    ]


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Soft-delete a Widget Studio session."""
    session = _get_owned_session(session_id, current_user.id, db)
    session.is_deleted = True
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sessions/{session_id}/message", response_model=SendMessageResponse)
async def send_message(
    session_id: str,
    body: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SendMessageResponse:
    """Run the orchestrator for one user message."""
    settings = get_settings()
    if not settings.widget_studio_enabled:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, detail="Widget Studio is disabled."
        )

    limit = settings.widget_studio_message_rate_limit_per_minute
    try:
        check_widget_studio_message_rate_limit(current_user.id, limit)
    except WidgetStudioRateLimited as exc:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, detail=exc.message
        ) from exc

    session = _get_owned_session(session_id, current_user.id, db)
    is_super = current_user.role == UserRole.super_admin

    try:
        fx = _coerce_widget_studio_filters(
            date_from=body.filters.date_from,
            date_to=body.filters.date_to,
            bank=body.filters.bank,
            banks=body.filters.banks,
            parent_category=body.filters.parent_category,
            sub_categories=body.filters.sub_categories,
        )
        result = await run_widget_studio_turn(
            session,
            body.message,
            db,
            include_agent_logs=is_super,
            include_sql_in_preview=is_super,
            **fx,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("widget studio message failed session=%s", session_id)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process message.",
        ) from exc

    return SendMessageResponse(**result)


@router.post("/widgets", status_code=status.HTTP_201_CREATED)
async def save_widget(
    body: SaveWidgetRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Save a widget definition and link the chat session."""
    _get_owned_session(body.session_id, current_user.id, db)
    resolved = body.resolved_query.strip() if body.resolved_query else ""
    if not resolved:
        resolved = translate_abstract_sql(body.abstract_query)
    widget = WidgetDefinition(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=body.name,
        type=body.type,
        intent_text=body.intent_text,
        abstract_query=body.abstract_query,
        resolved_query=resolved,
        hardcoded_filters=body.hardcoded_filters,
        chart_config=body.chart_config,
    )
    db.add(widget)
    session = db.get(WidgetChatSession, body.session_id)
    if session:
        session.widget_id = widget.id
    db.commit()
    db.refresh(widget)
    return {"id": widget.id, "name": widget.name, "type": widget.type}


@router.get("/widgets", response_model=list[WidgetSummary])
async def list_widgets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WidgetSummary]:
    """List saved widgets for the user."""
    widgets = db.scalars(
        select(WidgetDefinition)
        .where(
            WidgetDefinition.user_id == current_user.id,
            WidgetDefinition.is_deleted.is_(False),
        )
        .order_by(WidgetDefinition.created_at.desc())
    ).all()
    return [
        WidgetSummary(
            id=w.id,
            name=w.name,
            type=w.type,
            created_at=w.created_at,
            broken=bool(w.broken),
        )
        for w in widgets
    ]


@router.get("/widgets/{widget_id}/render", response_model=RenderWidgetResponse)
async def render_widget(
    widget_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    bank: str | None = Query(None),
    banks: Annotated[list[str] | None, Query()] = None,
    parent_category: str | None = Query(None),
    sub_categories: Annotated[list[str] | None, Query()] = None,
) -> RenderWidgetResponse:
    """Execute saved widget SQL with current filters."""
    widget = db.get(WidgetDefinition, widget_id)
    if widget is None or widget.is_deleted or widget.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Widget not found.")

    if widget.broken or mark_widget_broken_if_needed(widget, current_user.id, db):
        return RenderWidgetResponse(**widget_broken_response())

    fx = _coerce_widget_studio_filters(
        date_from=date_from,
        date_to=date_to,
        bank=bank,
        banks=banks,
        parent_category=parent_category,
        sub_categories=sub_categories,
    )
    try:
        data, _, executed_sql = execute_resolved_query(
            widget.resolved_query,
            current_user.id,
            db,
            **fx,
        )
        return RenderWidgetResponse(
            data=data,
            executed_query=executed_sql,
            resolved_query_template=widget.resolved_query,
        )
    except WidgetQueryExecutionError as exc:
        return RenderWidgetResponse(error="EXECUTION_ERROR", message=exc.user_message)


@router.post("/preview/execute", response_model=RenderWidgetResponse)
async def execute_preview_query(
    body: PreviewExecuteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RenderWidgetResponse:
    """Execute a widget SQL template (chat draft) with current dashboard filters."""
    if not body.resolved_query.strip():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="resolved_query is required."
        )
    fx = _coerce_widget_studio_filters(
        date_from=body.date_from,
        date_to=body.date_to,
        bank=body.bank,
        banks=body.banks,
        parent_category=body.parent_category,
        sub_categories=body.sub_categories,
    )
    try:
        data, _, executed_sql = execute_resolved_query(
            body.resolved_query.strip(),
            current_user.id,
            db,
            **fx,
        )
        return RenderWidgetResponse(
            data=data,
            executed_query=executed_sql,
            resolved_query_template=body.resolved_query.strip(),
        )
    except WidgetQueryExecutionError as exc:
        return RenderWidgetResponse(error="EXECUTION_ERROR", message=exc.user_message)


@router.patch("/widgets/{widget_id}")
async def rename_widget(
    widget_id: str,
    body: RenameWidgetRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Rename a saved widget."""
    widget = db.get(WidgetDefinition, widget_id)
    if widget is None or widget.is_deleted or widget.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Widget not found.")
    widget.name = body.name.strip()
    db.commit()
    return {"id": widget.id, "name": widget.name}


@router.post(
    "/widgets/{widget_id}/add-to-dashboard", status_code=status.HTTP_201_CREATED
)
async def add_widget_to_dashboard(
    widget_id: str,
    body: AddToDashboardRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Promote a Widget Studio definition to ``user_widgets`` and dashboard layout."""
    widget = db.get(WidgetDefinition, widget_id)
    if widget is None or widget.is_deleted or widget.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Widget not found.")
    if widget.broken or mark_widget_broken_if_needed(widget, current_user.id, db):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=WIDGET_BROKEN_MESSAGE,
        )
    dash_widget, layout = add_studio_widget_to_dashboard(
        db,
        current_user.id,
        title=widget.name,
        studio_widget_type=widget.type,
        abstract_query=widget.abstract_query,
        hardcoded_filters=widget.hardcoded_filters,
        col_span=body.col_span,
    )
    db.commit()
    return {
        "dashboard_widget_id": dash_widget.id,
        "layout": layout,
    }


@router.delete(
    "/widgets/{widget_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_widget(
    widget_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Soft-delete a saved widget."""
    widget = db.get(WidgetDefinition, widget_id)
    if widget is None or widget.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Widget not found.")
    widget.is_deleted = True
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/sessions/{session_id}/logs")
async def get_session_logs(
    session_id: str,
    _admin: User = Depends(require_super_admin),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return agent logs for a session (super admin only)."""
    _get_owned_session(session_id, current_user.id, db)
    logs = db.scalars(
        select(WidgetAgentLog)
        .where(WidgetAgentLog.session_id == session_id)
        .order_by(WidgetAgentLog.created_at)
    ).all()
    return [
        {
            "id": log.id,
            "agent_name": log.agent_name,
            "input": log.input,
            "output": log.output,
            "raw_query": log.raw_query,
            "translated_query": log.translated_query,
            "execution_result": log.execution_result,
            "error": log.error,
            "duration_ms": log.duration_ms,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]


@router.get("/widgets/{widget_id}/debug")
async def widget_debug(
    widget_id: str,
    _admin: User = Depends(require_super_admin),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return debug fields for a widget (super admin only)."""
    widget = db.get(WidgetDefinition, widget_id)
    if widget is None or widget.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Widget not found.")

    last_log = db.scalar(
        select(WidgetAgentLog)
        .where(WidgetAgentLog.translated_query == widget.resolved_query)
        .order_by(WidgetAgentLog.created_at.desc())
        .limit(1)
    )
    return {
        "abstract_query": widget.abstract_query,
        "resolved_query": widget.resolved_query,
        "last_execution_result": last_log.execution_result if last_log else None,
        "last_error": last_log.error if last_log else None,
    }
