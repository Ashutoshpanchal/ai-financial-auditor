"""Widget Studio LLM configuration (OpenRouter via LangChain — same stack as the main app)."""

from __future__ import annotations

from backend.config import get_settings


def get_widget_studio_model_name() -> str:
    """Return the model name used for Widget Studio agents."""
    return get_settings().openrouter_model


def get_widget_studio_api_key() -> str:
    """Return the API key for Widget Studio agents."""
    return get_settings().openrouter_api_key
