"""SQLAlchemy ORM model for the category_master table."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base


class CategoryMaster(Base):
    """Parent/sub-category dictionary: global seed rows and per-user extensions.

    Rows with ``user_id`` NULL are seeded via migration (shared). Rows with
    ``user_id`` set belong to that user and override the same (parent, sub) pair
    in API responses when both exist.
    """

    __tablename__ = "category_master"

    id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        server_default=text("(gen_random_uuid())::text"),
    )
    parent_category: Mapped[str] = mapped_column(String(100), nullable=False)
    sub_category: Mapped[str] = mapped_column(String(100), nullable=False)
    user_id: Mapped[str | None] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, onupdate=func.now()
    )
    updated_by: Mapped[str | None] = mapped_column(
        String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
