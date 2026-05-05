"""Documents router — upload bank statements, list, and retrieve document details."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from backend.database import get_db, set_rls_user
from backend.middleware.auth import get_current_user
from backend.models.document import Document, DocumentStatus
from backend.models.transaction import Transaction
from backend.models.user import User
from backend.parsers.csv_parser import parse_csv
from backend.services.drive import upload_file as drive_upload_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

# Allowed MIME types and their canonical file_type strings
_ALLOWED_MIME_TYPES: dict[str, str] = {
    "text/csv": "csv",
    "application/csv": "csv",
    "application/pdf": "pdf",
}


def _detect_file_type(content_type: str) -> str | None:
    """Map a MIME content-type string to 'csv' or 'pdf', or return None if unsupported.

    Args:
        content_type: The Content-Type header value from the uploaded file.

    Returns:
        'csv', 'pdf', or None if the MIME type is not accepted.
    """
    # Normalise by stripping parameters (e.g. 'text/csv; charset=utf-8' → 'text/csv')
    mime_base = content_type.split(";")[0].strip().lower()
    return _ALLOWED_MIME_TYPES.get(mime_base)


async def _run_audit_background(
    document_id: str,
    transactions: list[dict],
    user_id: str,
) -> None:
    """Execute the audit pipeline in a background task and persist the AuditReport.

    This function opens its own DB session because it runs after the request
    session has been closed.

    Args:
        document_id: ID of the Document ORM record being audited.
        transactions: Parsed transaction dicts from the statement parser.
        user_id:      ID of the owning user (used for RLS and report ownership).
    """
    # Import inside function to avoid circular imports at module load time
    from backend.chains.audit import run_audit
    from backend.database import SessionLocal

    db: Session = SessionLocal()
    try:
        set_rls_user(db, user_id)
        document = db.query(Document).filter(Document.id == document_id).first()
        if document is None:
            logger.error(
                "Background audit: document %s not found for user %s", document_id, user_id
            )
            return
        await run_audit(db=db, document=document, transactions=transactions, user_id=user_id)
        logger.info("Background audit completed for document %s", document_id)
    except Exception as exc:
        logger.exception(
            "Background audit failed for document %s: %s", document_id, exc
        )
        try:
            document = db.query(Document).filter(Document.id == document_id).first()
            if document:
                document.status = DocumentStatus.failed
                document.error_message = str(exc)
                db.commit()
        except Exception as inner_exc:
            logger.exception(
                "Failed to update document status to failed for %s: %s",
                document_id,
                inner_exc,
            )
    finally:
        db.close()


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile,
    bank_name: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Upload a bank statement (CSV or PDF), parse it, embed transactions, and queue audit.

    Accepts multipart/form-data with:
      - file:      The bank statement file (CSV or PDF).
      - bank_name: Human-readable name of the bank (e.g. 'HDFC', 'SBI').

    The file is uploaded to Google Drive using the authenticated user's stored
    OAuth tokens, a Document record is created, transactions are parsed and
    stored, embeddings are generated, and an audit is queued as a background
    task.

    Args:
        background_tasks: FastAPI BackgroundTasks for deferred audit execution.
        file:             The uploaded file (UploadFile).
        bank_name:        Bank identifier provided as a form field.
        current_user:     Authenticated user injected by the auth dependency.
        db:               SQLAlchemy session injected by the DB dependency.

    Returns:
        Dict containing document_id, filename, bank_name, status, drive_web_url.

    Raises:
        HTTPException 422: If the file type is not CSV or PDF.
        HTTPException 502: If the Google Drive upload fails.
        HTTPException 500: If parsing or embedding fails unexpectedly.
    """
    # --- Validate file type ---
    content_type: str = file.content_type or ""
    file_type = _detect_file_type(content_type)
    if file_type is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Unsupported file type '{content_type}'. "
                "Only 'text/csv' and 'application/pdf' are accepted."
            ),
        )

    # --- Read file bytes ---
    try:
        file_bytes: bytes = await file.read()
    except Exception as exc:
        logger.exception("Failed to read uploaded file bytes: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not read uploaded file: {exc}",
        ) from exc

    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is empty.",
        )

    # --- Upload to Google Drive ---
    today = datetime.now(tz=UTC).date()
    try:
        drive_result = drive_upload_file(
            access_token=current_user.google_access_token,
            refresh_token=current_user.google_refresh_token,
            file_bytes=file_bytes,
            filename=file.filename or f"statement_{today}.{file_type}",
            mime_type=content_type.split(";")[0].strip(),
            upload_date=today,
        )
    except Exception as exc:
        logger.exception("Google Drive upload failed for user %s: %s", current_user.id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Google Drive upload failed: {exc}",
        ) from exc

    # --- Create Document record (status: uploaded) ---
    document_id = str(uuid.uuid4())
    document = Document(
        id=document_id,
        user_id=current_user.id,
        filename=file.filename or f"statement_{today}.{file_type}",
        bank_name=bank_name.strip(),
        file_type=file_type,
        drive_file_id=drive_result["drive_file_id"],
        drive_folder_id=drive_result["drive_folder_id"],
        drive_web_url=drive_result.get("drive_web_url"),
        status=DocumentStatus.uploaded,
    )
    try:
        db.add(document)
        db.commit()
        db.refresh(document)
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to persist Document record %s: %s", document_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create document record: {exc}",
        ) from exc

    # --- Parse transactions ---
    document.status = DocumentStatus.parsing
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to update document status to parsing: %s", exc)

    try:
        if file_type == "csv":
            raw_transactions = parse_csv(file_bytes, bank_name=bank_name.strip())
        else:
            # PDF parsing: import dynamically since pdf_parser may not exist yet
            try:
                from backend.parsers.pdf_parser import parse_pdf
                raw_transactions = parse_pdf(file_bytes, bank_name=bank_name.strip())
            except ImportError as imp_exc:
                raise ValueError(
                    "PDF parser is not available. Ensure backend.parsers.pdf_parser is installed."
                ) from imp_exc
    except Exception as exc:
        document.status = DocumentStatus.failed
        document.error_message = f"Parsing failed: {exc}"
        try:
            db.commit()
        except Exception:
            db.rollback()
        logger.exception("Parsing failed for document %s: %s", document_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse document: {exc}",
        ) from exc

    # --- Persist Transaction rows ---
    try:
        for txn_dict in raw_transactions:
            txn = Transaction(
                id=str(uuid.uuid4()),
                user_id=current_user.id,
                document_id=document_id,
                bank_name=txn_dict.get("bank_name", bank_name.strip()),
                transaction_date=txn_dict["date"],
                description=txn_dict["description"],
                amount=txn_dict["amount"],
                category=txn_dict.get("category"),
            )
            db.add(txn)
        db.commit()
    except Exception as exc:
        db.rollback()
        document.status = DocumentStatus.failed
        document.error_message = f"Failed to persist transactions: {exc}"
        try:
            db.commit()
        except Exception:
            db.rollback()
        logger.exception("Failed to persist transactions for document %s: %s", document_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to persist transactions: {exc}",
        ) from exc

    # Update status to parsed
    document.status = DocumentStatus.parsed
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to update document status to parsed: %s", exc)

    # --- Embed transactions ---
    document.status = DocumentStatus.embedding
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to update document status to embedding: %s", exc)

    try:
        from backend.chains.embeddings import embed_transactions
        embed_transactions(
            transactions=raw_transactions,
            db=db,
            document_id=document_id,
            user_id=current_user.id,
        )
    except Exception as exc:
        document.status = DocumentStatus.failed
        document.error_message = f"Embedding failed: {exc}"
        try:
            db.commit()
        except Exception:
            db.rollback()
        logger.exception("Embedding failed for document %s: %s", document_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to embed transactions: {exc}",
        ) from exc

    # Embedding done — revert to parsed before audit kicks off
    document.status = DocumentStatus.parsed
    try:
        db.commit()
        db.refresh(document)
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to update document status after embedding: %s", exc)

    # --- Queue audit as background task ---
    background_tasks.add_task(
        _run_audit_background,
        document_id=document_id,
        transactions=raw_transactions,
        user_id=current_user.id,
    )

    return {
        "document_id": document.id,
        "filename": document.filename,
        "bank_name": document.bank_name,
        "status": document.status.value,
        "drive_web_url": document.drive_web_url,
    }


@router.get("", status_code=status.HTTP_200_OK)
def list_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return a summary list of all documents belonging to the authenticated user.

    Applies Row Level Security so the query is scoped to the current user's
    PostgreSQL session variable.

    Args:
        current_user: Authenticated user injected by the auth dependency.
        db:           SQLAlchemy session injected by the DB dependency.

    Returns:
        List of dicts with id, filename, bank_name, status, upload_date.

    Raises:
        HTTPException 500: If the database query fails unexpectedly.
    """
    try:
        set_rls_user(db, current_user.id)
        documents = (
            db.query(Document)
            .filter(Document.user_id == current_user.id)
            .order_by(Document.upload_date.desc())
            .all()
        )
    except Exception as exc:
        logger.exception("Failed to list documents for user %s: %s", current_user.id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve documents: {exc}",
        ) from exc

    return [
        {
            "id": doc.id,
            "filename": doc.filename,
            "bank_name": doc.bank_name,
            "status": doc.status.value,
            "upload_date": doc.upload_date.isoformat() if doc.upload_date else None,
        }
        for doc in documents
    ]


@router.get("/{document_id}", status_code=status.HTTP_200_OK)
def get_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return full details for a single document, including its transaction count.

    Applies Row Level Security before querying.

    Args:
        document_id:  UUID string of the document to retrieve.
        current_user: Authenticated user injected by the auth dependency.
        db:           SQLAlchemy session injected by the DB dependency.

    Returns:
        Dict with all document fields plus a transaction_count integer.

    Raises:
        HTTPException 404: If no document with the given ID exists for this user.
        HTTPException 500: If the database query fails unexpectedly.
    """
    try:
        set_rls_user(db, current_user.id)
        document = (
            db.query(Document)
            .filter(Document.id == document_id, Document.user_id == current_user.id)
            .first()
        )
    except Exception as exc:
        logger.exception(
            "Failed to query document %s for user %s: %s", document_id, current_user.id, exc
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve document: {exc}",
        ) from exc

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' not found.",
        )

    try:
        transaction_count: int = (
            db.query(Transaction)
            .filter(Transaction.document_id == document_id)
            .count()
        )
    except Exception as exc:
        logger.exception(
            "Failed to count transactions for document %s: %s", document_id, exc
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve transaction count: {exc}",
        ) from exc

    return {
        "id": document.id,
        "user_id": document.user_id,
        "filename": document.filename,
        "bank_name": document.bank_name,
        "file_type": document.file_type,
        "drive_file_id": document.drive_file_id,
        "drive_folder_id": document.drive_folder_id,
        "drive_web_url": document.drive_web_url,
        "status": document.status.value,
        "error_message": document.error_message,
        "upload_date": document.upload_date.isoformat() if document.upload_date else None,
        "transaction_count": transaction_count,
    }
