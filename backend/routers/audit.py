"""Audit router — retrieve AI audit reports by report ID, document ID, or paginated list."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.database import get_db, set_rls_user
from backend.middleware.auth import get_current_user
from backend.models.audit_report import AuditReport

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from backend.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audit", tags=["audit"])

# Maximum rows allowed per paginated request
_MAX_PAGE_LIMIT: int = 100


def _serialize_report_full(report: AuditReport) -> dict[str, Any]:
    """Serialize an AuditReport ORM object to a full response dict.

    Args:
        report: AuditReport ORM instance.

    Returns:
        Dict with id, document_id, summary, insights, graph_json, created_at.
    """
    return {
        "id": report.id,
        "document_id": report.document_id,
        "summary": report.summary,
        "insights": report.insights,
        "graph_json": report.graph_json,
        "created_at": report.created_at.isoformat() if report.created_at else None,
    }


def _serialize_report_summary(report: AuditReport) -> dict[str, Any]:
    """Serialize an AuditReport ORM object to a lightweight summary dict.

    Args:
        report: AuditReport ORM instance.

    Returns:
        Dict with id, document_id, summary, created_at.
    """
    return {
        "id": report.id,
        "document_id": report.document_id,
        "summary": report.summary,
        "created_at": report.created_at.isoformat() if report.created_at else None,
    }


@router.get("", status_code=status.HTTP_200_OK)
def list_audit_reports(
    skip: int = Query(
        default=0, ge=0, description="Number of records to skip (offset)."
    ),
    limit: int = Query(
        default=20, ge=1, le=_MAX_PAGE_LIMIT, description="Max records to return."
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return a paginated list of audit report summaries for the authenticated user.

    Applies Row Level Security before querying. Results are ordered by creation
    date descending (newest first).

    Args:
        skip:         Number of records to skip; must be >= 0.
        limit:        Maximum number of records to return; 1-100.
        current_user: Authenticated user injected by the auth dependency.
        db:           SQLAlchemy session injected by the DB dependency.

    Returns:
        List of dicts with id, document_id, summary, created_at.

    Raises:
        HTTPException 500: If the database query fails unexpectedly.
    """
    try:
        set_rls_user(db, current_user.id)
        reports = (
            db.query(AuditReport)
            .filter(AuditReport.user_id == current_user.id)
            .order_by(AuditReport.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
    except Exception as exc:
        logger.exception(
            "Failed to list audit reports for user %s: %s", current_user.id, exc
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve audit reports: {exc}",
        ) from exc

    return [_serialize_report_summary(r) for r in reports]


@router.get("/document/{document_id}", status_code=status.HTTP_200_OK)
def get_audit_report_by_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return the audit report for a specific document.

    Applies Row Level Security before querying. Useful for polling the audit
    result after a document upload — returns 404 until the audit is complete.

    Args:
        document_id:  UUID string of the document whose report is requested.
        current_user: Authenticated user injected by the auth dependency.
        db:           SQLAlchemy session injected by the DB dependency.

    Returns:
        Dict with id, document_id, summary, insights, graph_json, created_at.

    Raises:
        HTTPException 404: If no audit report exists for the given document ID.
        HTTPException 500: If the database query fails unexpectedly.
    """
    try:
        set_rls_user(db, current_user.id)
        report = (
            db.query(AuditReport)
            .filter(
                AuditReport.document_id == document_id,
                AuditReport.user_id == current_user.id,
            )
            .first()
        )
    except Exception as exc:
        logger.exception(
            "Failed to query audit report for document %s, user %s: %s",
            document_id,
            current_user.id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve audit report: {exc}",
        ) from exc

    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No audit report found for document '{document_id}'.",
        )

    return _serialize_report_full(report)


@router.get("/{report_id}", status_code=status.HTTP_200_OK)
def get_audit_report(
    report_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return a single audit report by its report ID.

    Applies Row Level Security before querying. Returns 404 if the report
    does not exist or belongs to a different user.

    Args:
        report_id:    UUID string of the audit report to retrieve.
        current_user: Authenticated user injected by the auth dependency.
        db:           SQLAlchemy session injected by the DB dependency.

    Returns:
        Dict with id, document_id, summary, insights, graph_json, created_at.

    Raises:
        HTTPException 404: If the report is not found or owned by another user.
        HTTPException 500: If the database query fails unexpectedly.
    """
    try:
        set_rls_user(db, current_user.id)
        report = (
            db.query(AuditReport)
            .filter(
                AuditReport.id == report_id,
                AuditReport.user_id == current_user.id,
            )
            .first()
        )
    except Exception as exc:
        logger.exception(
            "Failed to query audit report %s for user %s: %s",
            report_id,
            current_user.id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve audit report: {exc}",
        ) from exc

    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit report '{report_id}' not found.",
        )

    return _serialize_report_full(report)
