"""Dashboard model — per-user dashboard layout configuration."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base


class UserDashboard(Base):
    """Per-user dashboard layout — one row per user, stores grid widget positions."""

    __tablename__ = "user_dashboards"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid4())
    )  # surrogate PK — UUID generated in application layer
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, unique=True, index=True
    )  # owner reference; unique constraint enforces one dashboard per user
    layout: Mapped[dict] = mapped_column(
        JSON, nullable=False, default=lambda: {"cols": 3, "grid": []}
    )  # grid layout config — cols defines column count, grid holds widget positions
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )  # last modification timestamp — updated on every layout change
