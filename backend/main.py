"""FastAPI application entry point — registers all routers and startup hooks."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config import get_settings
from backend.database import engine
from backend.db_migrations import run_database_bootstrap
from backend.models import (  # noqa: F401 — side-effect: registers models with Base
    audit_report,
    category_master,
    category_rule,
    chat_session,
    dashboard,
    document,
    transaction,
    user,
    widget,
)
from backend.models.base import Base
from backend.routers import (
    admin,
    analytics,
    audit,
    auth,
    categories,
    chat,
    dashboard as dashboard_router,
    documents,
    transactions,
)

logger = logging.getLogger(__name__)
settings = get_settings()


def _configure_backend_logging() -> None:
    """Ensure ``backend.*`` loggers emit (Docker root logger is often WARNING)."""
    level_name = settings.log_level.upper()
    numeric = getattr(logging, level_name, logging.INFO)
    logging.getLogger("backend").setLevel(numeric)


_configure_backend_logging()


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    """Run DB extensions, SQL migrations, ORM DDL, and seed repair before serving traffic."""
    skip = os.environ.get("SKIP_DB_BOOTSTRAP", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )
    if skip:
        logger.info("SKIP_DB_BOOTSTRAP is set — skipping automatic database bootstrap.")
    else:
        run_database_bootstrap(engine, Base)
    yield


app = FastAPI(
    title="AI Financial Auditor",
    description="Personal finance auditor powered by LangChain + LangGraph + OpenRouter",
    version="0.1.0",
    lifespan=_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
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
app.include_router(analytics.router)
app.include_router(dashboard_router.router)


@app.get("/health")
async def health_check():
    """Liveness probe for Docker health checks."""
    return {"status": "ok", "environment": settings.environment}
