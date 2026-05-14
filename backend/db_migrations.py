"""Apply ordered SQL migrations once each, then ensure ORM tables exist and seed globals."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

import sqlparse
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from backend.config import get_settings

logger = logging.getLogger(__name__)

_SCHEMA_MIGRATIONS_DDL = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""


def resolve_migrations_dir() -> Path:
    """Return the migrations directory if it exists on disk.

    Resolution order:

    1. ``Settings.migrations_dir`` / ``MIGRATIONS_DIR`` when set and the path exists.
    2. ``<repository root>/migrations`` derived from this file's location (works in Docker
       with ``WORKDIR /app`` and local ``pytest`` from the repo).
    """
    settings = get_settings()
    if settings.migrations_dir:
        candidate = Path(settings.migrations_dir).expanduser().resolve()
        if candidate.is_dir():
            return candidate
        logger.warning(
            "Configured migrations_dir does not exist or is not a directory: %s — falling back.",
            candidate,
        )
    derived = Path(__file__).resolve().parent.parent / "migrations"
    if derived.is_dir():
        return derived
    fallback = Path("/app/migrations")
    if fallback.is_dir():
        return fallback
    raise FileNotFoundError(
        "Could not resolve migrations directory. Set MIGRATIONS_DIR to an existing folder "
        "containing numbered *.sql files."
    )


def split_sql_migration_statements(sql: str) -> list[str]:
    """Split a migration file into executable statements (dollar-quoted blocks stay intact)."""
    parts: list[str] = []
    for fragment in sqlparse.split(sql):
        stripped = fragment.strip()
        if stripped:
            parts.append(stripped)
    return parts


def parse_category_master_seed_pairs(sql_text: str) -> list[tuple[str, str]]:
    """Extract ``(parent_category, sub_category)`` pairs from ``007_categories.sql`` INSERT rows."""
    pattern = re.compile(
        r"gen_random_uuid\(\)\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*\)",
        flags=re.MULTILINE,
    )
    pairs: list[tuple[str, str]] = []
    for parent_raw, sub_raw in pattern.findall(sql_text):
        pairs.append(
            (
                parent_raw.replace("''", "'"),
                sub_raw.replace("''", "'"),
            )
        )
    return pairs


def _migration_filenames(migrations_dir: Path) -> list[Path]:
    """Return ``*.sql`` paths sorted lexically (``001_...`` before ``010_...``)."""
    return sorted(migrations_dir.glob("*.sql"), key=lambda p: p.name)


def apply_pending_migrations(engine: Engine, migrations_dir: Path) -> None:
    """Apply numbered ``*.sql`` files once each, tracked in ``schema_migrations``."""
    with engine.begin() as conn:
        conn.execute(text(_SCHEMA_MIGRATIONS_DDL))

    for path in _migration_filenames(migrations_dir):
        with engine.begin() as conn:
            already = conn.execute(
                text("SELECT 1 FROM schema_migrations WHERE filename = :fn LIMIT 1"),
                {"fn": path.name},
            ).scalar()
            if already is not None:
                logger.debug("Skipping already applied migration %s", path.name)
                continue
            body = path.read_text(encoding="utf-8")
            statements = split_sql_migration_statements(body)
            logger.info(
                "Applying SQL migration %s (%d statements)", path.name, len(statements)
            )
            for stmt in statements:
                conn.execute(text(stmt))
            conn.execute(
                text("INSERT INTO schema_migrations (filename) VALUES (:fn)"),
                {"fn": path.name},
            )


def ensure_orm_tables_exist(engine: Engine, declarative_base: Any) -> None:
    """Create ORM tables when they are not already in the database."""
    declarative_base.metadata.create_all(bind=engine)


def seed_category_master_global_if_empty(engine: Engine, migrations_dir: Path) -> None:
    """If ``category_master`` exists but has no rows, insert global seed pairs (``user_id`` NULL)."""
    insp = inspect(engine)
    if not insp.has_table("category_master"):
        return
    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM category_master")).scalar()
    if count not in (None, 0):
        return
    seed_path = migrations_dir / "007_categories.sql"
    if not seed_path.is_file():
        logger.warning(
            "category_master is empty but %s is missing — cannot seed.", seed_path
        )
        return
    pairs = parse_category_master_seed_pairs(seed_path.read_text(encoding="utf-8"))
    if not pairs:
        logger.warning("No seed pairs parsed from %s — skipping seed.", seed_path)
        return
    logger.info(
        "Seeding %d global category_master rows (table was empty).",
        len(pairs),
    )
    column_names = {c["name"] for c in insp.get_columns("category_master")}
    has_user_id = "user_id" in column_names
    with engine.begin() as conn:
        for parent, sub in pairs:
            if has_user_id:
                stmt = text(
                    "INSERT INTO category_master (parent_category, sub_category, user_id) "
                    "VALUES (:parent, :sub, NULL)"
                )
            else:
                stmt = text(
                    "INSERT INTO category_master (parent_category, sub_category) "
                    "VALUES (:parent, :sub)"
                )
            conn.execute(stmt, {"parent": parent, "sub": sub})


def run_database_bootstrap(engine: Engine, declarative_base: Any) -> None:
    """Run SQL migrations, ORM ``create_all``, and category seed repair before serving traffic."""
    migrations_dir = resolve_migrations_dir()
    logger.info("Database bootstrap using migrations from %s", migrations_dir)
    apply_pending_migrations(engine, migrations_dir)
    ensure_orm_tables_exist(engine, declarative_base)
    seed_category_master_global_if_empty(engine, migrations_dir)
