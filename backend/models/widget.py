"""Widget model — per-user saved chart/query widget definitions."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base


class UserWidget(Base):
    """Widget library entry — one row per widget definition owned by a user."""

    __tablename__ = "user_widgets"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid4())
    )  # surrogate PK — UUID generated in application layer
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )  # owner reference; cascade delete handled at DB level
    title: Mapped[str] = mapped_column(
        String, nullable=False
    )  # human-readable widget name
    widget_type: Mapped[str] = mapped_column(
        String, nullable=False
    )  # e.g. "bar_chart", "pie", "table"
    query_config: Mapped[dict] = mapped_column(
        JSON, nullable=False
    )  # query parameters driving the widget
    is_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )  # True if this widget ships as a system default
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )  # row creation timestamp set by the database
