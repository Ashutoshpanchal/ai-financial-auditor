"""Admin router — user management endpoints for admin and super_admin roles.

Endpoints:
    GET    /admin/users                       List all users (admin+).
    GET    /admin/users/{user_id}             Get a single user (admin+).
    POST   /admin/users                       Create a new user (super_admin only).
    PATCH  /admin/users/{user_id}/role        Update a user's role (super_admin only).
    PATCH  /admin/users/{user_id}/password    Set/change a user's password (super_admin only).
    DELETE /admin/users/{user_id}             Delete a user account (super_admin only).
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth import require_admin, require_super_admin
from backend.models.user import User, UserRole
from backend.services.auth import hash_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class CreateUserRequest(BaseModel):
    """Request body for creating a new user directly (no Google OAuth)."""

    name: str
    email: EmailStr
    role: UserRole = UserRole.user
    password: str


class UpdateRoleRequest(BaseModel):
    """Request body for changing a user's role."""

    role: UserRole


class UpdatePasswordRequest(BaseModel):
    """Request body for setting/changing a user's password."""

    password: str


def _serialize_user(user: User) -> dict[str, Any]:
    """Serialize a User ORM object to a safe response dict (no tokens).

    Args:
        user: User ORM instance.

    Returns:
        Dict with id, email, name, picture, role, created_at, updated_at.
    """
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "role": user.role.value,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/users",
    status_code=status.HTTP_200_OK,
    summary="List all users",
)
def list_users(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return a list of all registered users ordered by creation date.

    Only admin and super_admin roles may call this endpoint.

    Args:
        current_user: Authenticated admin/super_admin user.
        db:           SQLAlchemy session.

    Returns:
        List of user dicts (no OAuth tokens exposed).

    Raises:
        HTTPException 500: If the database query fails.
    """
    try:
        users = db.query(User).order_by(User.created_at.desc()).all()
    except Exception as exc:
        logger.exception("list_users: DB query failed for admin=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve users: {exc}",
        ) from exc

    return [_serialize_user(u) for u in users]


@router.get(
    "/users/{user_id}",
    status_code=status.HTTP_200_OK,
    summary="Get a user by ID",
)
def get_user(
    user_id: str,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return full details for a single user by their ID.

    Only admin and super_admin roles may call this endpoint.

    Args:
        user_id:      The target user's UUID string.
        current_user: Authenticated admin/super_admin user.
        db:           SQLAlchemy session.

    Returns:
        User dict (no OAuth tokens exposed).

    Raises:
        HTTPException 404: If no user with that ID exists.
        HTTPException 500: If the database query fails.
    """
    try:
        user = db.query(User).filter(User.id == user_id).first()
    except Exception as exc:
        logger.exception("get_user: DB query failed for user_id=%s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve user: {exc}",
        ) from exc

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{user_id}' not found.",
        )

    return _serialize_user(user)


@router.post(
    "/users",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new user (super_admin only)",
)
def create_user(
    body: CreateUserRequest,
    current_user: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Create a new user account without requiring Google OAuth.

    The password is hashed before storage, enabling password-based dev login.
    A synthetic google_id (``manual-<uuid>``) is assigned so the unique
    constraint is satisfied.

    Args:
        body:         Name, email, role, and initial password for the new user.
        current_user: Authenticated super_admin user.
        db:           SQLAlchemy session.

    Returns:
        The newly created user dict.

    Raises:
        HTTPException 409: If a user with that email already exists.
        HTTPException 500: If the database insert fails.
    """
    existing = db.query(User).filter(User.email == body.email).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A user with email '{body.email}' already exists.",
        )

    new_user = User(
        id=str(uuid.uuid4()),
        google_id=f"manual-{uuid.uuid4()}",
        email=body.email,
        name=body.name,
        role=body.role,
        password_hash=hash_password(body.password),
    )
    db.add(new_user)
    try:
        db.commit()
        db.refresh(new_user)
    except Exception as exc:
        db.rollback()
        logger.exception("create_user: commit failed for email=%s", body.email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user: {exc}",
        ) from exc

    logger.info(
        "create_user: admin=%s created user=%s role=%s",
        current_user.id,
        new_user.id,
        new_user.role.value,
    )
    return _serialize_user(new_user)


@router.patch(
    "/users/{user_id}/role",
    status_code=status.HTTP_200_OK,
    summary="Update a user's role (super_admin only)",
)
def update_user_role(
    user_id: str,
    body: UpdateRoleRequest,
    current_user: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Change the role of a user. Only super_admin may promote/demote others.

    A super_admin cannot demote themselves to prevent accidental lockout.

    Args:
        user_id:      The target user's UUID string.
        body:         New role to assign.
        current_user: Authenticated super_admin user.
        db:           SQLAlchemy session.

    Returns:
        Updated user dict.

    Raises:
        HTTPException 400: If the super_admin attempts to change their own role.
        HTTPException 404: If no user with that ID exists.
        HTTPException 500: If the database update fails.
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Super admins cannot change their own role.",
        )

    try:
        user = db.query(User).filter(User.id == user_id).first()
    except Exception as exc:
        logger.exception("update_user_role: DB query failed for user_id=%s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve user: {exc}",
        ) from exc

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{user_id}' not found.",
        )

    old_role = user.role
    user.role = body.role
    try:
        db.commit()
        db.refresh(user)
    except Exception as exc:
        db.rollback()
        logger.exception(
            "update_user_role: commit failed for user_id=%s new_role=%s",
            user_id,
            body.role,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update user role: {exc}",
        ) from exc

    logger.info(
        "update_user_role: admin=%s changed user=%s role %s → %s",
        current_user.id,
        user_id,
        old_role.value,
        body.role.value,
    )
    return _serialize_user(user)


@router.patch(
    "/users/{user_id}/password",
    status_code=status.HTTP_200_OK,
    summary="Set/change user password (super_admin only)",
)
def update_user_password(
    user_id: str,
    body: UpdatePasswordRequest,
    current_user: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Set or change the password for a user, enabling password-based dev login.

    Only super_admin may call this endpoint.

    Args:
        user_id:      The target user's UUID string.
        body:         New plaintext password (hashed before storage).
        current_user: Authenticated super_admin user.
        db:           SQLAlchemy session.

    Returns:
        Updated user dict.

    Raises:
        HTTPException 404: If no user with that ID exists.
        HTTPException 500: If the database update fails.
    """
    try:
        user = db.query(User).filter(User.id == user_id).first()
    except Exception as exc:
        logger.exception(
            "update_user_password: DB query failed for user_id=%s", user_id
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve user: {exc}",
        ) from exc

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{user_id}' not found.",
        )

    user.password_hash = hash_password(body.password)
    try:
        db.commit()
        db.refresh(user)
    except Exception as exc:
        db.rollback()
        logger.exception("update_user_password: commit failed for user_id=%s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update password: {exc}",
        ) from exc

    logger.info(
        "update_user_password: admin=%s set password for user=%s",
        current_user.id,
        user_id,
    )
    return _serialize_user(user)


@router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a user account (super_admin only)",
)
def delete_user(
    user_id: str,
    current_user: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Permanently delete a user account. Only super_admin may do this.

    A super_admin cannot delete their own account.

    Args:
        user_id:      The target user's UUID string.
        current_user: Authenticated super_admin user.
        db:           SQLAlchemy session.

    Raises:
        HTTPException 400: If the super_admin attempts to delete themselves.
        HTTPException 404: If no user with that ID exists.
        HTTPException 500: If the database delete fails.
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Super admins cannot delete their own account.",
        )

    try:
        user = db.query(User).filter(User.id == user_id).first()
    except Exception as exc:
        logger.exception("delete_user: DB query failed for user_id=%s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve user: {exc}",
        ) from exc

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{user_id}' not found.",
        )

    try:
        db.delete(user)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("delete_user: commit failed for user_id=%s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete user: {exc}",
        ) from exc

    logger.info("delete_user: admin=%s deleted user=%s", current_user.id, user_id)
    return {"message": f"User '{user_id}' deleted."}
