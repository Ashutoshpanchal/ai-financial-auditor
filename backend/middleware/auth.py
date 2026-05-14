"""Auth middleware — JWT verification and role-based access control."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.database import get_db
from backend.models.user import User, UserRole
from backend.services.auth import decode_app_jwt

if TYPE_CHECKING:
    from collections.abc import Callable

    from sqlalchemy.orm import Session

bearer_scheme = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Extract and verify JWT from Authorization header. Raises 401 if invalid."""
    token: str | None = None

    # Support both Authorization header and httpOnly cookie
    if credentials:
        token = credentials.credentials
    else:
        token = request.cookies.get("access_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    payload = decode_app_jwt(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )

    return user


async def get_current_user_or_dev_analyze_bypass(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the current user, or in dev-only mode allow unauthenticated AI Sync.

    When ``ALLOW_ANALYZE_WITHOUT_AUTH=1`` and ``ENVIRONMENT`` is not ``production``,
    missing/invalid browser auth falls back to the user with ``SUPER_ADMIN_EMAIL``,
    or the first row in ``users`` (for local curl / debugging). Production always
    requires a valid JWT or cookie.
    """
    from backend.config import get_settings

    settings = get_settings()
    token: str | None = None
    if credentials:
        token = credentials.credentials
    else:
        token = request.cookies.get("access_token")

    if token:
        payload = decode_app_jwt(token)
        if payload:
            user = db.query(User).filter(User.id == payload["sub"]).first()
            if user:
                return user

    if (
        settings.allow_analyze_without_auth
        and settings.environment.lower() != "production"
    ):
        user = db.query(User).filter(User.email == settings.super_admin_email).first()
        if user is not None:
            logger.warning(
                "ALLOW_ANALYZE_WITHOUT_AUTH: using super_admin user id=%s for /categories/analyze",
                user.id,
            )
            return user
        first = db.query(User).first()
        if first is not None:
            logger.warning(
                "ALLOW_ANALYZE_WITHOUT_AUTH: super_admin not in DB; using first user id=%s",
                first.id,
            )
            return first
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "ALLOW_ANALYZE_WITHOUT_AUTH is enabled but no users were found. "
                "Log in once or seed users."
            ),
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
    )


def require_roles(*roles: UserRole) -> Callable:
    """Dependency factory — raises 403 if the current user's role is not in allowed roles."""

    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role.value}' not permitted for this action",
            )
        return current_user

    return checker


# Convenience role dependencies
require_admin = require_roles(UserRole.admin, UserRole.super_admin)
require_super_admin = require_roles(UserRole.super_admin)
