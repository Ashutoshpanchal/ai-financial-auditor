"""SQLAlchemy ORM model for the category_master table."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base


class CategoryMaster(Base):
    """Global parent/sub-category dictionary shared across all users.

    Rows are pre-seeded via migration and may be extended by admins at runtime.
    """

    __tablename__ = "category_master"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    parent_category: Mapped[str] = mapped_column(String(100), nullable=False)
    sub_category: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, onupdate=func.now()
    )
    updated_by: Mapped[str | None] = mapped_column(
        String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
