"""AuditReport model — stores LangChain audit output including Graphify knowledge graph JSON."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base


class AuditReport(Base):
    """One audit report per document — stores structured insights + Graphify graph data."""

    __tablename__ = "audit_reports"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    document_id: Mapped[str] = mapped_column(String, ForeignKey("documents.id"), nullable=False, unique=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    # Structured audit output: categories, anomalies, recommendations
    insights: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # Graphify knowledge graph JSON for frontend rendering
    graph_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
