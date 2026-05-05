"""Database session factory and dependency injection for FastAPI."""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from backend.config import get_settings


def _make_engine():
    """Create SQLAlchemy engine from DATABASE_URL in settings."""
    settings = get_settings()
    return create_engine(settings.database_url, pool_pre_ping=True)


engine = _make_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency — yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def set_rls_user(db: Session, user_id: str) -> None:
    """Set the PostgreSQL session variable used by Row Level Security policies."""
    db.execute(text("SET LOCAL app.current_user_id = :uid"), {"uid": user_id})
