"""Transactions router — edit and delete individual transactions."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Response, status

from backend.database import get_db, set_rls_user
from backend.middleware.auth import get_current_user
from backend.models.transaction import Transaction

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from backend.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.patch("/{transaction_id}", status_code=status.HTTP_200_OK)
def update_transaction(
    transaction_id: str,
    body: dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Update editable fields on a single transaction.

    Accepts any of: bank_name, transaction_date, description, amount, category.

    Args:
        transaction_id: UUID of the transaction to update.
        body:           JSON body with fields to update.
        current_user:   Authenticated user.
        db:             SQLAlchemy session.

    Returns:
        Dict with updated transaction fields.

    Raises:
        HTTPException 404: If the transaction is not found for this user.
        HTTPException 500: If the update fails.
    """
    set_rls_user(db, current_user.id)
    txn = (
        db.query(Transaction)
        .filter(
            Transaction.id == transaction_id, Transaction.user_id == current_user.id
        )
        .first()
    )
    if txn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction '{transaction_id}' not found.",
        )

    if "bank_name" in body:
        txn.bank_name = str(body["bank_name"]).strip()
    if "transaction_date" in body:
        txn.transaction_date = str(body["transaction_date"]).strip()
    if "description" in body:
        txn.description = str(body["description"]).strip()
    if "debit" in body:
        txn.debit = float(body["debit"])
    if "credit" in body:
        txn.credit = float(body["credit"])
    if "category" in body:
        txn.category = str(body["category"]).strip() if body["category"] else None
    if "remarks" in body:
        txn.remarks = body["remarks"]

    try:
        db.commit()
        db.refresh(txn)
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to update transaction %s: %s", transaction_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update transaction: {exc}",
        ) from exc

    return {
        "id": txn.id,
        "bank_name": txn.bank_name,
        "transaction_date": txn.transaction_date.isoformat(),
        "description": txn.description,
        "debit": float(txn.debit),
        "credit": float(txn.credit),
        "category": txn.category,
        "parent_category": txn.parent_category,
        "sub_category": txn.sub_category,
        "category_master_id": txn.category_master_id,
        "remarks": txn.remarks,
    }


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    transaction_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a single transaction.

    Args:
        transaction_id: UUID of the transaction to delete.
        current_user:   Authenticated user.
        db:             SQLAlchemy session.

    Returns:
        204 No Content on success.

    Raises:
        HTTPException 404: If the transaction is not found for this user.
        HTTPException 500: If the deletion fails.
    """
    set_rls_user(db, current_user.id)
    txn = (
        db.query(Transaction)
        .filter(
            Transaction.id == transaction_id, Transaction.user_id == current_user.id
        )
        .first()
    )
    if txn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction '{transaction_id}' not found.",
        )

    try:
        db.delete(txn)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to delete transaction %s: %s", transaction_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete transaction: {exc}",
        ) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)
