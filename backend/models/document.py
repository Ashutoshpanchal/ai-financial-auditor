"""Document model — tracks uploaded files and their Google Drive location."""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base



class DocumentStatus(enum.StrEnum):
    """Processing lifecycle of an uploaded document."""

    uploaded = "uploaded"
    parsing = "parsing"
    parsed = "parsed"
    embedding = "embedding"
    auditing = "auditing"
    completed = "completed"
    failed = "failed"


class Document(Base):
    """Represents one uploaded bank statement (CSV or PDF)."""

    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String, nullable=False)
    bank_name: Mapped[str] = mapped_column(String, nullable=False)
    file_type: Mapped[str] = mapped_column(String, nullable=False)  # "csv" or "pdf"
    # Google Drive references
    drive_file_id: Mapped[str] = mapped_column(String, nullable=False)
    drive_folder_id: Mapped[str] = mapped_column(String, nullable=False)
    drive_web_url: Mapped[str | None] = mapped_column(String, nullable=True)
    file_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus), default=DocumentStatus.uploaded, nullable=False
    )
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)
    upload_date: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
