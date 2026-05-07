"""SQLAlchemy ORM model for the description_categories table."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base


class DescriptionCategory(Base):
    """Per-user mapping of transaction descriptions to categories.

    Rows are created by the LLM categorization pipeline and may be
    overridden by the user via the PATCH endpoint.
    """

    __tablename__ = "description_categories"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(String, nullable=False)
    parent_category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sub_category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, onupdate=func.now()
    )
    updated_by: Mapped[str | None] = mapped_column(
        String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
