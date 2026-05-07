"""FastAPI application entry point — registers all routers and startup hooks."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from backend.config import get_settings
from backend.database import engine
from backend.models import (  # noqa: F401 — side-effect: registers models with Base
    audit_report,
    category_master,
    chat_session,
    description_category,
    document,
    transaction,
    user,
)
from backend.models.base import Base
from backend.routers import (
    admin,
    audit,
    auth,
    categories,
    chat,
    documents,
    transactions,
)

logger = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI(
    title="AI Financial Auditor",
    description="Personal finance auditor powered by LangChain + LangGraph + OpenRouter",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve Graphify HTML outputs — each audit writes its graph here
_static_graphs = Path("static/graphs")
_static_graphs.mkdir(parents=True, exist_ok=True)
app.mount("/static/graphs", StaticFiles(directory=str(_static_graphs)), name="graphs")

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(audit.router)
app.include_router(chat.router)
app.include_router(admin.router)
app.include_router(transactions.router)
app.include_router(categories.router)


def _run_migrations() -> None:
    """Apply any pending SQL migration files in order.

    Migrations live in /migrations and are named NNN_<name>.sql.
    Applied migrations are tracked in the schema_migrations table so each
    script runs exactly once, even across container restarts.
    """
    migrations_dir = Path(__file__).parent.parent / "migrations"
    if not migrations_dir.is_dir():
        return

    sql_files = sorted(migrations_dir.glob("*.sql"))
    if not sql_files:
        return

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    filename TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
        )
        applied: set[str] = {
            row[0]
            for row in conn.execute(
                text("SELECT filename FROM schema_migrations")
            ).fetchall()
        }

        for sql_file in sql_files:
            name = sql_file.name
            if name in applied:
                continue
            logger.info("Applying migration: %s", name)
            conn.execute(text(sql_file.read_text()))
            conn.execute(
                text("INSERT INTO schema_migrations (filename) VALUES (:n)"),
                {"n": name},
            )
            logger.info("Migration applied: %s", name)


@app.on_event("startup")
def _init_db() -> None:
    """Enable extensions, run pending migrations, then create any missing tables."""
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
    _run_migrations()
    Base.metadata.create_all(bind=engine)
    logger.info("Database ready.")


@app.get("/health")
async def health_check():
    """Liveness probe for Docker health checks."""
    return {"status": "ok", "environment": settings.environment}
