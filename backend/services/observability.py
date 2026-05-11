"""ObservabilityManager — builds LangChain callback list from env toggle.

Usage:
    from backend.services.observability import get_callbacks
    chain.invoke(input, config={"callbacks": get_callbacks()})
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

from backend.config import get_settings

if TYPE_CHECKING:
    from langchain_core.callbacks import BaseCallbackHandler

_LANGFUSE_HANDLER: BaseCallbackHandler | None = None
_LANGFUSE_DISABLED = False


def get_callbacks() -> list[BaseCallbackHandler]:
    """Return active observability callback handlers based on OBSERVABILITY_BACKENDS env var.

    Supports: langsmith, langfuse, or both simultaneously.
    Returns empty list if neither is configured.
    """
    settings = get_settings()
    callbacks: list[BaseCallbackHandler] = []

    if settings.langsmith_enabled:
        _configure_langsmith(settings)

    if settings.langfuse_enabled:
        handler = _build_langfuse_handler(settings)
        if handler:
            callbacks.append(handler)

    return callbacks


def _configure_langsmith(settings) -> None:
    """Set LangSmith env vars — LangSmith uses env vars rather than a callback handler."""
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = settings.langsmith_api_key
    os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project


def _build_langfuse_handler(settings) -> BaseCallbackHandler | None:
    """Instantiate Langfuse callback handler, return None if import fails."""
    global _LANGFUSE_HANDLER, _LANGFUSE_DISABLED

    if _LANGFUSE_DISABLED:
        return None
    if _LANGFUSE_HANDLER is not None:
        return _LANGFUSE_HANDLER

    try:
        import logging

        import httpx
        from langfuse.callback import CallbackHandler as LangfuseHandler  # type: ignore

        # Fail fast when host is unreachable to avoid repeated noisy async tracebacks.
        try:
            with httpx.Client(timeout=1.5) as client:
                client.get(settings.langfuse_host)
        except Exception as exc:
            logging.getLogger(__name__).warning(
                "Langfuse host unreachable (%s); disabling Langfuse callbacks.",
                exc,
            )
            _LANGFUSE_DISABLED = True
            return None

        _LANGFUSE_HANDLER = LangfuseHandler(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
        )
        return _LANGFUSE_HANDLER
    except ImportError:
        # Langfuse not installed — skip silently only at import level, log a warning
        import logging

        logging.getLogger(__name__).warning(
            "langfuse package not installed; skipping Langfuse handler"
        )
        _LANGFUSE_DISABLED = True
        return None
