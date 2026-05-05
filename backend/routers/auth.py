"""Auth router — Google OAuth2 login and callback endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth import get_current_user
from backend.models.user import User
from backend.services.auth import (
    create_app_jwt,
    exchange_code_for_tokens,
    get_google_auth_url,
    get_google_user_info,
    upsert_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/google/login")
async def google_login():
    """Redirect URL for Google OAuth2 — frontend sends user to this URL."""
    return {"auth_url": get_google_auth_url()}


@router.get("/google/callback")
async def google_callback(code: str, response: Response, db: Session = Depends(get_db)):
    """Google OAuth2 callback — exchanges code for tokens, upserts user, sets JWT cookie."""
    try:
        tokens = await exchange_code_for_tokens(code)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    try:
        google_user = await get_google_user_info(tokens["access_token"])
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    user = upsert_user(db, google_user, tokens)
    app_token = create_app_jwt(user)

    # Set JWT in httpOnly cookie — frontend never sees the raw token
    response.set_cookie(
        key="access_token",
        value=app_token,
        httponly=True,
        secure=False,  # TODO: set True in production
        samesite="lax",
        max_age=7 * 24 * 3600,
    )

    return {"user": {"id": user.id, "email": user.email, "name": user.name, "role": user.role}}


@router.post("/logout")
async def logout(response: Response):
    """Clear the JWT cookie to end the session."""
    response.delete_cookie("access_token")
    return {"message": "Logged out"}


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "picture": current_user.picture,
        "role": current_user.role,
    }
