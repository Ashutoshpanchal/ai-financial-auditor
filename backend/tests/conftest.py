"""Shared pytest fixtures for the AI Financial Auditor test suite."""

from __future__ import annotations

import os
from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

# Use a separate test database
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/ai_financial_auditor_test",
)

# ---------------------------------------------------------------------------
# Database fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def engine() -> Generator:
    """Create a SQLAlchemy engine for the test database (session-scoped)."""
    eng = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    yield eng
    eng.dispose()


@pytest.fixture(scope="function")
def db_session(engine) -> Generator[Session, None, None]:
    """Provide a transactional database session that rolls back after each test."""
    connection = engine.connect()
    transaction = connection.begin()
    session_factory = sessionmaker(bind=connection)
    session = session_factory()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


# ---------------------------------------------------------------------------
# Mock LLM fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_llm() -> Generator[MagicMock, None, None]:
    """Mock ChatOpenAI so tests don't call OpenRouter."""
    with patch("backend.agents.nodes.ChatOpenAI") as mock_cls:
        mock_instance = MagicMock()
        mock_response = MagicMock()
        mock_response.content = (
            '{"intent": "general", "query": null, "month1": null, "month2": null}'
        )
        mock_instance.ainvoke = AsyncMock(return_value=mock_response)
        mock_cls.return_value = mock_instance
        yield mock_instance


@pytest.fixture
def mock_embeddings() -> Generator[MagicMock, None, None]:
    """Mock OpenAIEmbeddings so tests don't call OpenRouter."""
    with patch("backend.agents.tools.OpenAIEmbeddings") as mock_cls:
        mock_instance = MagicMock()
        # Return a 1536-dim vector (text-embedding-3-small)
        mock_instance.embed_query = MagicMock(return_value=[0.01] * 1536)
        mock_cls.return_value = mock_instance
        yield mock_instance


@pytest.fixture
def mock_settings() -> Generator[MagicMock, None, None]:
    """Mock get_settings so tests don't need a real .env."""
    with (
        patch("backend.agents.nodes.get_settings") as mock_nodes,
        patch("backend.agents.tools.get_settings") as mock_tools,
    ):
        settings = MagicMock()
        settings.openrouter_model = "test-model"
        settings.openrouter_api_key = "test-key"
        settings.openrouter_base_url = "https://openrouter.ai/api/v1"
        settings.openrouter_embedding_model = "openai/text-embedding-3-small"
        mock_nodes.return_value = settings
        mock_tools.return_value = settings
        yield settings


# ---------------------------------------------------------------------------
# Sample data fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sample_user_id() -> str:
    """Return a sample user ID for tests."""
    return "user-123-test"


@pytest.fixture
def sample_transactions() -> list[dict]:
    """Return sample transaction data for tests."""
    return [
        {
            "id": "tx-1",
            "bank_name": "Chase",
            "transaction_date": "2024-01-15",
            "description": "Starbucks",
            "debit": 5.67,
            "credit": 0.0,
            "category": "Food & Drink",
        },
        {
            "id": "tx-2",
            "bank_name": "Chase",
            "transaction_date": "2024-01-16",
            "description": "Whole Foods",
            "debit": 45.23,
            "credit": 0.0,
            "category": "Groceries",
        },
        {
            "id": "tx-3",
            "bank_name": "Chase",
            "transaction_date": "2024-01-17",
            "description": "Netflix",
            "debit": 15.99,
            "credit": 0.0,
            "category": "Entertainment",
        },
    ]


@pytest.fixture
def sample_agent_state(sample_user_id: str) -> dict:
    """Return a sample AgentState for testing graph nodes."""
    return {
        "messages": [
            {
                "role": "user",
                "content": "Show me my spending summary",
                "timestamp": "2024-01-15T10:00:00Z",
            }
        ],
        "user_id": sample_user_id,
        "session_id": "session-123",
        "tool_calls": [],
        "tool_results": [],
        "final_response": "",
    }
