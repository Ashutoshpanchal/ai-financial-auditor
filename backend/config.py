"""Central configuration — all env vars loaded here, never hardcoded elsewhere."""

from __future__ import annotations

from functools import lru_cache
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    secret_key: str
    super_admin_email: str
    environment: str = "development"

    # Google OAuth2
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"

    # OpenRouter
    openrouter_api_key: str
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "meta-llama/llama-3.3-70b-instruct"
    openrouter_embedding_model: str = "openai/text-embedding-3-small"

    # Database
    database_url: str

    # Observability — comma-separated: "langsmith", "langfuse", or "langsmith,langfuse"
    observability_backends: str = ""

    # LangSmith
    langsmith_api_key: Optional[str] = None
    langchain_project: str = "ai-financial-auditor"
    langchain_tracing_v2: bool = False

    # Langfuse
    langfuse_public_key: Optional[str] = None
    langfuse_secret_key: Optional[str] = None
    langfuse_host: str = "http://localhost:3001"

    @property
    def active_backends(self) -> List[str]:
        """Return list of enabled observability backend names."""
        return [b.strip() for b in self.observability_backends.split(",") if b.strip()]

    @property
    def langsmith_enabled(self) -> bool:
        """True if LangSmith is in the active backends list."""
        return "langsmith" in self.active_backends and bool(self.langsmith_api_key)

    @property
    def langfuse_enabled(self) -> bool:
        """True if Langfuse is in the active backends list."""
        return "langfuse" in self.active_backends and bool(self.langfuse_public_key)


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance — call this everywhere instead of instantiating directly."""
    return Settings()
