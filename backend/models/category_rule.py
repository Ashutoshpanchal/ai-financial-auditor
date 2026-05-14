"""SQLAlchemy ORM model for per-user category_rules (pattern → parent/sub)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base


class CategoryRule(Base):
    """Maps transaction description patterns to category_master parent/sub pairs."""

    __tablename__ = "category_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    match_type: Mapped[str] = mapped_column(String(20), nullable=False, default="exact")
    pattern: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    parent_category: Mapped[str] = mapped_column(String(100), nullable=False)
    sub_category: Mapped[str] = mapped_column(String(100), nullable=False)
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, onupdate=func.now()
    )
    updated_by: Mapped[str | None] = mapped_column(
        String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
