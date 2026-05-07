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
    chat_session,
    document,
    transaction,
    user,
)
from backend.models.base import Base
from backend.routers import admin, audit, auth, chat, documents, transactions

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


@app.on_event("startup")
def _init_db() -> None:
    """Create all tables and enable pgvector on startup if they don't exist yet."""
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables verified / created.")


@app.get("/health")
async def health_check():
    """Liveness probe for Docker health checks."""
    return {"status": "ok", "environment": settings.environment}
