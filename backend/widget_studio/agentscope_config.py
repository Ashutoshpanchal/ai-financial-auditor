"""AgentScope model configuration for Widget Studio (OpenRouter)."""

from __future__ import annotations

from functools import lru_cache

from agentscope.model import OpenAIChatModel

from backend.config import get_settings


@lru_cache
def build_chat_model(*, stream: bool = False) -> OpenAIChatModel:
    """Return an AgentScope chat model pointed at OpenRouter.

    Args:
        stream: When False, returns a single ``ChatResponse`` (easier JSON parse).

    Returns:
        Configured ``OpenAIChatModel`` instance.
    """
    settings = get_settings()
    client_kwargs: dict[str, str] = {"base_url": settings.openrouter_base_url}
    return OpenAIChatModel(
        model_name=settings.openrouter_model,
        api_key=settings.openrouter_api_key,
        stream=stream,
        client_kwargs=client_kwargs,
        generate_kwargs={"temperature": 0.1, "max_tokens": 2048},
    )
