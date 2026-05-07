"""Google OAuth2 service — handles login flow, token exchange, and JWT creation."""

from __future__ import annotations

import hashlib
import os
import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import httpx
from jose import jwt

from backend.config import get_settings
from backend.models.user import User, UserRole

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_SCOPES = "openid email profile https://www.googleapis.com/auth/drive.file"


# ---------------------------------------------------------------------------
# Password hashing (PBKDF2-SHA256, no external deps)
# ---------------------------------------------------------------------------


def hash_password(password: str) -> str:
    """Hash a plaintext password using PBKDF2-SHA256 with a random salt.

    Args:
        password: Plaintext password to hash.

    Returns:
        String in the form ``<hex-salt>$<hex-digest>`` suitable for storage.
    """
    salt = os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), 100_000
    ).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a plaintext password against a stored PBKDF2 hash.

    Args:
        password:    Plaintext candidate password.
        stored_hash: Value previously returned by :func:`hash_password`.

    Returns:
        True if the password matches, False otherwise.
    """
    try:
        salt, digest = stored_hash.split("$", 1)
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), salt.encode(), 100_000
        ).hex()
        return candidate == digest
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Google OAuth helpers
# ---------------------------------------------------------------------------


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


async def exchange_code_for_tokens(code: str) -> dict:
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


async def get_google_user_info(access_token: str) -> dict:
    """Fetch Google user profile using the access token."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if response.status_code != 200:
            raise ValueError(f"Failed to fetch user info: {response.text}")
        return response.json()


def upsert_user(db: Session, google_user: dict, tokens: dict) -> User:
    """Create or update a user from Google profile data. Assign super_admin if email matches env."""
    settings = get_settings()

    expires_in = tokens.get("expires_in", 3600)
    token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)

    user = db.query(User).filter(User.google_id == google_user["sub"]).first()

    if user is None:
        # Determine role — super_admin if email matches env var
        role = (
            UserRole.super_admin
            if google_user["email"] == settings.super_admin_email
            else UserRole.user
        )
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
        "exp": datetime.now(UTC) + timedelta(days=7),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_app_jwt(token: str) -> dict | None:
    """Decode and verify the app JWT. Returns None if invalid or expired."""
    settings = get_settings()
    try:
        return jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except Exception:
        return None


def dev_login(db: Session, email: str, password: str) -> User:
    """Authenticate via plain password for local development — never call in production.

    Verification order:
      1. If the user has a ``password_hash`` stored, verify against it.
      2. If the user is the designated super_admin and has no stored hash,
         fall back to the global ``DEV_LOGIN_PASSWORD`` env var.

    The super_admin user is auto-created on first login when no row exists yet.

    Args:
        db:       SQLAlchemy session.
        email:    Email of the user to authenticate.
        password: Plaintext password to verify.

    Returns:
        The authenticated User.

    Raises:
        ValueError: If environment is not development, credentials are wrong,
                    or the user doesn't exist and isn't the configured super_admin.
    """
    settings = get_settings()

    if settings.environment != "development":
        raise ValueError("Dev login is only available in development mode.")

    user = db.query(User).filter(User.email == email).first()

    if user is None:
        # Auto-create only the designated super_admin
        if email != settings.super_admin_email:
            raise ValueError("Invalid credentials.")
        if not settings.dev_login_password:
            raise ValueError("DEV_LOGIN_PASSWORD is not set in .env.")
        if password != settings.dev_login_password:
            raise ValueError("Invalid credentials.")
        user = User(
            id=str(uuid.uuid4()),
            google_id=f"dev-{uuid.uuid4()}",
            email=email,
            name="Dev Admin",
            role=UserRole.super_admin,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    # User exists — verify password
    if user.password_hash:
        if not verify_password(password, user.password_hash):
            raise ValueError("Invalid credentials.")
    elif user.email == settings.super_admin_email:
        # Fallback: super_admin without a stored hash uses global DEV_LOGIN_PASSWORD
        if not settings.dev_login_password:
            raise ValueError("DEV_LOGIN_PASSWORD is not set in .env.")
        if password != settings.dev_login_password:
            raise ValueError("Invalid credentials.")
    else:
        raise ValueError("Invalid credentials.")

    return user
