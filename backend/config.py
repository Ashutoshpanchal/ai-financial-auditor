"""Central configuration — all env vars loaded here, never hardcoded elsewhere."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # App
    secret_key: str
    super_admin_email: str
    environment: str = "development"
    # Logging: DEBUG shows full LLM payloads in categories router; INFO previews only.
    log_level: str = "INFO"

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
    # Optional absolute path to numbered ``*.sql`` migrations (default: ``<repo>/migrations``).
    migrations_dir: str | None = None

    # Observability — comma-separated: "langsmith", "langfuse", or "langsmith,langfuse"
    observability_backends: str = ""

    # LangSmith
    langsmith_api_key: str | None = None
    langchain_project: str = "ai-financial-auditor"
    langchain_tracing_v2: bool = False

    # Langfuse
    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    langfuse_host: str = "http://localhost:3001"

    # Local file storage fallback (used when Google Drive creds are absent)
    local_storage_path: str = "storage"

    # Browser origins allowed for credentialed CORS (comma-separated). Include 127.0.0.1 if you open the UI that way.
    cors_allow_origins: str = "http://localhost:3002,http://127.0.0.1:3002"

    # Dev only: if true and ENVIRONMENT is not production, POST /categories/analyze may run without JWT
    # (uses SUPER_ADMIN_EMAIL user, or first user). Never enable in production.
    allow_analyze_without_auth: bool = False

    # Dev-only bypass login (ignored in production)
    dev_login_password: str | None = None

    @property
    def active_backends(self) -> list[str]:
        """Return list of enabled observability backend names."""
        return [b.strip() for b in self.observability_backends.split(",") if b.strip()]

    @property
    def langsmith_enabled(self) -> bool:
        """True if LangSmith is in the active backends list."""
        return "langsmith" in self.active_backends and bool(self.langsmith_api_key)

    @property
    def langfuse_enabled(self) -> bool:
        """True if Langfuse is in the active backends list."""
        return (
            "langfuse" in self.active_backends
            and bool(self.langfuse_public_key)
            and bool(self.langfuse_secret_key)
        )

    @property
    def cors_origins_list(self) -> list[str]:
        """Origins for CORSMiddleware (trimmed, non-empty)."""
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance — call this everywhere instead of instantiating directly."""
    return Settings()
