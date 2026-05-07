"""Documents router — upload bank statements, list, and retrieve document details."""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Body,
    Depends,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)

from backend.database import get_db, set_rls_user
from backend.middleware.auth import get_current_user
from backend.models.document import Document, DocumentStatus
from backend.models.transaction import Transaction
from backend.parsers.csv_parser import parse_csv
from backend.services.drive import upload_file as drive_upload_file

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from backend.models.user import User

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
                "Background audit: document %s not found for user %s",
                document_id,
                user_id,
            )
            return
        await run_audit(
            db=db, document=document, transactions=transactions, user_id=user_id
        )
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
    bank_name: str | None = Form(default=None),
    pdf_password: str | None = Form(default=None),
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

    # bank_name is optional for all uploads; defaults to "Unknown Bank" when omitted.

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

    # --- Duplicate detection via file hash ---
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    set_rls_user(db, current_user.id)
    existing_doc = (
        db.query(Document)
        .filter(Document.user_id == current_user.id, Document.file_hash == file_hash)
        .first()
    )
    if existing_doc is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "This file has already been uploaded.",
                "document_id": existing_doc.id,
                "filename": existing_doc.filename,
                "upload_date": existing_doc.upload_date.isoformat()
                if existing_doc.upload_date
                else None,
            },
        )

    # --- Upload to Google Drive (or local storage if no creds) ---
    today = datetime.now(tz=UTC).date()
    try:
        drive_result = drive_upload_file(
            access_token=current_user.google_access_token,
            refresh_token=current_user.google_refresh_token,
            file_bytes=file_bytes,
            filename=file.filename or f"statement_{today}.{file_type}",
            mime_type=content_type.split(";")[0].strip(),
            upload_date=today,
            user_id=current_user.id,
        )
    except Exception as exc:
        logger.exception("File upload failed for user %s: %s", current_user.id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"File upload failed: {exc}",
        ) from exc

    # --- Create Document record (status: uploaded) ---
    document_id = str(uuid.uuid4())
    document = Document(
        id=document_id,
        user_id=current_user.id,
        filename=file.filename or f"statement_{today}.{file_type}",
        bank_name=(bank_name.strip() if bank_name else "Unknown Bank"),
        file_type=file_type,
        drive_file_id=drive_result["drive_file_id"],
        drive_folder_id=drive_result["drive_folder_id"],
        drive_web_url=drive_result.get("drive_web_url"),
        file_hash=file_hash,
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

    safe_bank_name = bank_name.strip() if bank_name else "Unknown Bank"

    try:
        if file_type == "csv":
            raw_transactions = parse_csv(file_bytes, bank_name=safe_bank_name)
        else:
            # PDF parsing: import dynamically since pdf_parser may not exist yet
            try:
                from backend.parsers.pdf_parser import parse_pdf

                raw_transactions = parse_pdf(
                    file_bytes,
                    bank_name=safe_bank_name
                    if safe_bank_name != "Unknown Bank"
                    else None,
                    password=pdf_password or None,
                )
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

    # --- Update bank_name if auto-detected from PDF ---
    if file_type == "pdf" and raw_transactions:
        detected = raw_transactions[0].get("bank_name", "").strip()
        if detected and detected != "Unknown Bank":
            document.bank_name = detected
            bank_name = detected  # also update local var for transaction persistence
            try:
                db.commit()
            except Exception:
                db.rollback()

    # --- Persist Transaction rows ---
    try:
        for txn_dict in raw_transactions:
            txn = Transaction(
                id=str(uuid.uuid4()),
                user_id=current_user.id,
                document_id=document_id,
                bank_name=txn_dict.get("bank_name") or safe_bank_name,
                transaction_date=txn_dict["date"],
                description=txn_dict["description"],
                debit=float(txn_dict.get("debit", 0.0)),
                credit=float(txn_dict.get("credit", 0.0)),
                category=txn_dict.get("category"),
                remarks=txn_dict.get("remarks"),
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
        logger.exception(
            "Failed to persist transactions for document %s: %s", document_id, exc
        )
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
        logger.exception(
            "Failed to list documents for user %s: %s", current_user.id, exc
        )
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
            "Failed to query document %s for user %s: %s",
            document_id,
            current_user.id,
            exc,
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
            db.query(Transaction).filter(Transaction.document_id == document_id).count()
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
        "upload_date": document.upload_date.isoformat()
        if document.upload_date
        else None,
        "transaction_count": transaction_count,
    }


@router.patch("/{document_id}", status_code=status.HTTP_200_OK)
def update_document(
    document_id: str,
    body: dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Update editable fields (bank_name, filename) on a document.

    Args:
        document_id: UUID string of the document to update.
        body:        JSON body with optional 'bank_name' and/or 'filename'.
        current_user: Authenticated user injected by the auth dependency.
        db:           SQLAlchemy session injected by the DB dependency.

    Returns:
        Dict with updated document fields.

    Raises:
        HTTPException 404: If the document is not found for this user.
        HTTPException 500: If the update fails.
    """
    set_rls_user(db, current_user.id)
    document = (
        db.query(Document)
        .filter(Document.id == document_id, Document.user_id == current_user.id)
        .first()
    )
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' not found.",
        )

    if "bank_name" in body:
        document.bank_name = str(body["bank_name"]).strip()
    if "filename" in body:
        document.filename = str(body["filename"]).strip()

    try:
        db.commit()
        db.refresh(document)
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to update document %s: %s", document_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update document: {exc}",
        ) from exc

    return {
        "id": document.id,
        "filename": document.filename,
        "bank_name": document.bank_name,
        "status": document.status.value,
        "upload_date": document.upload_date.isoformat()
        if document.upload_date
        else None,
    }


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a document and cascade-delete its transactions and audit report.

    Args:
        document_id:  UUID string of the document to delete.
        current_user: Authenticated user injected by the auth dependency.
        db:           SQLAlchemy session injected by the DB dependency.

    Returns:
        204 No Content on success.

    Raises:
        HTTPException 404: If the document is not found for this user.
        HTTPException 500: If the deletion fails.
    """
    set_rls_user(db, current_user.id)
    document = (
        db.query(Document)
        .filter(Document.id == document_id, Document.user_id == current_user.id)
        .first()
    )
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' not found.",
        )

    try:
        # Transactions cascade via FK ON DELETE CASCADE; same for audit_reports.
        db.delete(document)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to delete document %s: %s", document_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete document: {exc}",
        ) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{document_id}/transactions", status_code=status.HTTP_200_OK)
def list_document_transactions(
    document_id: str,
    page: int = 1,
    page_size: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return paginated transactions for a specific document.

    Args:
        document_id: UUID of the document.
        page:        Page number (1-indexed).
        page_size:   Rows per page (max 200).
        current_user: Authenticated user.
        db:           SQLAlchemy session.

    Returns:
        Dict with 'items' list and 'total' count.

    Raises:
        HTTPException 404: If the document is not found for this user.
    """
    set_rls_user(db, current_user.id)
    document = (
        db.query(Document)
        .filter(Document.id == document_id, Document.user_id == current_user.id)
        .first()
    )
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' not found.",
        )

    page_size = min(max(page_size, 1), 200)
    offset = (max(page, 1) - 1) * page_size

    try:
        total: int = (
            db.query(Transaction).filter(Transaction.document_id == document_id).count()
        )
        rows = (
            db.query(Transaction)
            .filter(Transaction.document_id == document_id)
            .order_by(Transaction.transaction_date.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )
    except Exception as exc:
        logger.exception(
            "Failed to list transactions for document %s: %s", document_id, exc
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve transactions: {exc}",
        ) from exc

    return {
        "items": [
            {
                "id": txn.id,
                "bank_name": txn.bank_name,
                "transaction_date": txn.transaction_date.isoformat(),
                "description": txn.description,
                "debit": float(txn.debit),
                "credit": float(txn.credit),
                "category": txn.category,
                "remarks": txn.remarks,
            }
            for txn in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/transactions/all", status_code=status.HTTP_200_OK)
def list_all_transactions(
    page: int = 1,
    page_size: int = 50,
    search: str = "",
    bank_name: str = "",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return paginated transactions across ALL documents for the current user.

    Supports optional search (matches description, remarks) and bank_name filter.

    Args:
        page:        Page number (1-indexed).
        page_size:   Rows per page (max 200).
        search:      Free-text search across description and remarks.
        bank_name:   Filter by bank name.
        current_user: Authenticated user.
        db:           SQLAlchemy session.

    Returns:
        Dict with 'items' list, 'total' count, 'page', 'page_size'.
    """
    set_rls_user(db, current_user.id)
    page_size = min(max(page_size, 1), 200)
    offset = (max(page, 1) - 1) * page_size

    try:
        query = (
            db.query(Transaction)
            .join(Document, Transaction.document_id == Document.id)
            .filter(Document.user_id == current_user.id)
        )

        if bank_name:
            query = query.filter(Transaction.bank_name.ilike(f"%{bank_name}%"))

        if search:
            search_lower = f"%{search}%"
            query = query.filter(
                Transaction.description.ilike(search_lower)
                | Transaction.bank_name.ilike(search_lower)
            )

        total: int = query.count()
        rows = (
            query.order_by(Transaction.transaction_date.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )
    except Exception as exc:
        logger.exception(
            "Failed to list all transactions for user %s: %s", current_user.id, exc
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve transactions: {exc}",
        ) from exc

    return {
        "items": [
            {
                "id": txn.id,
                "bank_name": txn.bank_name,
                "transaction_date": txn.transaction_date.isoformat(),
                "description": txn.description,
                "debit": float(txn.debit),
                "credit": float(txn.credit),
                "category": txn.category,
                "remarks": txn.remarks,
            }
            for txn in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
