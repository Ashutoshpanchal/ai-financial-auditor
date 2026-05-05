"""Google OAuth2 service — handles login flow, token exchange, and JWT creation."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

import httpx
from jose import jwt
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.models.user import User, UserRole

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_SCOPES = "openid email profile https://www.googleapis.com/auth/drive.file"


def get_google_auth_url() -> str:
    """Build Google OAuth2 authorization URL with all required scopes."""
    settings = get_settings()
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": GOOGLE_SCOPES,
        "access_type": "offline",  # needed for refresh token
        "prompt": "consent",  # force consent to always get refresh token
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{GOOGLE_AUTH_URL}?{query}"


async def exchange_code_for_tokens(code: str) -> Dict:
    """Exchange OAuth2 authorization code for access + refresh tokens."""
    settings = get_settings()
    async with httpx.AsyncClient() as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if response.status_code != 200:
            raise ValueError(f"Token exchange failed: {response.text}")
        return response.json()


async def get_google_user_info(access_token: str) -> Dict:
    """Fetch Google user profile using the access token."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if response.status_code != 200:
            raise ValueError(f"Failed to fetch user info: {response.text}")
        return response.json()


def upsert_user(db: Session, google_user: Dict, tokens: Dict) -> User:
    """Create or update a user from Google profile data. Assign super_admin if email matches env."""
    settings = get_settings()

    expires_in = tokens.get("expires_in", 3600)
    token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

    user = db.query(User).filter(User.google_id == google_user["sub"]).first()

    if user is None:
        # Determine role — super_admin if email matches env var
        role = UserRole.super_admin if google_user["email"] == settings.super_admin_email else UserRole.user
        user = User(
            id=str(uuid.uuid4()),
            google_id=google_user["sub"],
            email=google_user["email"],
            name=google_user.get("name", ""),
            picture=google_user.get("picture"),
            role=role,
        )
        db.add(user)

    # Always update tokens on each login to keep them fresh
    user.google_access_token = tokens["access_token"]
    if "refresh_token" in tokens:
        user.google_refresh_token = tokens["refresh_token"]
    user.token_expires_at = token_expires_at
    db.commit()
    db.refresh(user)
    return user


def create_app_jwt(user: User) -> str:
    """Create a signed JWT for the app session containing user id and role."""
    settings = get_settings()
    payload = {
        "sub": user.id,
        "email": user.email,
        "role": user.role.value,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_app_jwt(token: str) -> Optional[Dict]:
    """Decode and verify the app JWT. Returns None if invalid or expired."""
    settings = get_settings()
    try:
        return jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except Exception:
        return None
