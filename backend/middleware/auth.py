"""Auth middleware — JWT verification and role-based access control."""

from __future__ import annotations

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
