"""FastAPI application entry point — registers all routers and startup hooks."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config import get_settings
from backend.routers import auth

settings = get_settings()

app = FastAPI(
    title="AI Financial Auditor",
    description="Personal finance auditor powered by LangChain + LangGraph + OpenRouter",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,  # required for httpOnly cookie auth
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve Graphify HTML outputs — each audit writes its graph here
_static_graphs = Path("static/graphs")
_static_graphs.mkdir(parents=True, exist_ok=True)
app.mount("/static/graphs", StaticFiles(directory=str(_static_graphs)), name="graphs")

# Routers — additional routers added here as phases complete
app.include_router(auth.router)
# TODO: app.include_router(documents.router)
# TODO: app.include_router(audit.router)
# TODO: app.include_router(chat.router)
# TODO: app.include_router(admin.router)


@app.get("/health")
async def health_check():
    """Liveness probe for Docker health checks."""
    return {"status": "ok", "environment": settings.environment}
