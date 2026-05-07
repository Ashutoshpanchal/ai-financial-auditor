"""Tests for backend.agents.tools — LangChain tools for the finance agent."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from backend.agents.tools import (
    _build_embeddings,
    _embed_query,
    compare_months,
    get_anomalies,
    get_spending_summary,
    search_transactions,
)

# ---------------------------------------------------------------------------
# _build_embeddings
# ---------------------------------------------------------------------------


class TestBuildEmbeddings:
    """Tests for the _build_embeddings helper."""

    @patch("backend.agents.tools.OpenAIEmbeddings")
    @patch("backend.agents.tools.get_settings")
    def test_build_embeddings_returns_instance(
        self, mock_settings, mock_embeddings_cls
    ):
        """_build_embeddings should return an OpenAIEmbeddings instance."""
        mock_settings.return_value = MagicMock(
            openrouter_embedding_model="openai/text-embedding-3-small",
            openrouter_api_key="test-key",
            openrouter_base_url="https://openrouter.ai/api/v1",
        )
        mock_embeddings_cls.return_value = MagicMock()

        result = _build_embeddings()

        assert result is not None
        mock_embeddings_cls.assert_called_once()

    @patch("backend.agents.tools.OpenAIEmbeddings")
    @patch("backend.agents.tools.get_settings")
    def test_build_embeddings_uses_settings(self, mock_settings, mock_embeddings_cls):
        """_build_embeddings should read model/key/base_url from settings."""
        settings = MagicMock(
            openrouter_embedding_model="test-model",
            openrouter_api_key="test-key",
            openrouter_base_url="https://test.url",
        )
        mock_settings.return_value = settings
        mock_embeddings_cls.return_value = MagicMock()

        _build_embeddings()

        mock_embeddings_cls.assert_called_once_with(
            model="test-model",
            openai_api_key="test-key",
            openai_api_base="https://test.url",
        )


# ---------------------------------------------------------------------------
# _embed_query
# ---------------------------------------------------------------------------


class TestEmbedQuery:
    """Tests for the _embed_query helper."""

    @patch("backend.agents.tools._build_embeddings")
    def test_embed_query_returns_vector(self, mock_build):
        """_embed_query should return a list of floats."""
        mock_build.return_value.embed_query.return_value = [0.1, 0.2, 0.3]

        result = _embed_query("test query")

        assert result == [0.1, 0.2, 0.3]
        mock_build.return_value.embed_query.assert_called_once_with("test query")

    @patch("backend.agents.tools._build_embeddings")
    def test_embed_query_raises_on_failure(self, mock_build):
        """_embed_query should raise RuntimeError when embedding fails."""
        mock_build.return_value.embed_query.side_effect = Exception("API error")

        with pytest.raises(RuntimeError, match="Embedding query failed"):
            _embed_query("test query")


# ---------------------------------------------------------------------------
# search_transactions
# ---------------------------------------------------------------------------


class TestSearchTransactions:
    """Tests for the search_transactions tool."""

    @pytest.fixture
    def mock_db(self):
        """Provide a mocked SQLAlchemy session."""
        return MagicMock()

    @patch("backend.agents.tools._embed_query")
    def test_search_transactions_returns_results(self, mock_embed, mock_db):
        """search_transactions should return formatted results."""
        mock_embed.return_value = [0.01] * 1536
        mock_row = MagicMock()
        mock_row.id = "tx-1"
        mock_row.bank_name = "Chase"
        mock_row.transaction_date = "2024-01-15"
        mock_row.description = "Starbucks"
        mock_row.debit = 5.67
        mock_row.credit = 0.0
        mock_row.category = "Food & Drink"
        mock_db.execute.return_value.fetchall.return_value = [mock_row]

        result = search_transactions.run(
            {
                "query": "coffee",
                "user_id": "user-123",
                "db": mock_db,
            }
        )

        assert "Starbucks" in result
        assert "Chase" in result
        assert "Food & Drink" in result

    @patch("backend.agents.tools._embed_query")
    def test_search_transactions_no_results(self, mock_embed, mock_db):
        """search_transactions should return a message when no results found."""
        mock_embed.return_value = [0.01] * 1536
        mock_db.execute.return_value.fetchall.return_value = []

        result = search_transactions.run(
            {
                "query": "nonexistent",
                "user_id": "user-123",
                "db": mock_db,
            }
        )

        assert "No transactions found" in result

    def test_search_transactions_embed_failure(self, mock_db):
        """search_transactions should raise RuntimeError when embedding fails."""
        with (
            patch(
                "backend.agents.tools._embed_query", side_effect=RuntimeError("fail")
            ),
            pytest.raises(RuntimeError, match="could not embed query"),
        ):
            search_transactions.run(
                {
                    "query": "test",
                    "user_id": "user-123",
                    "db": mock_db,
                }
            )


# ---------------------------------------------------------------------------
# get_spending_summary
# ---------------------------------------------------------------------------


class TestGetSpendingSummary:
    """Tests for the get_spending_summary tool."""

    @pytest.fixture
    def mock_db(self):
        return MagicMock()

    def test_spending_summary_returns_table(self, mock_db):
        """get_spending_summary should return a markdown table."""
        row1 = MagicMock()
        row1.category = "Food & Drink"
        row1.total = 150.50
        row2 = MagicMock()
        row2.category = "Groceries"
        row2.total = 300.00
        mock_db.execute.return_value.fetchall.return_value = [row1, row2]

        result = get_spending_summary.run(
            {
                "user_id": "user-123",
                "db": mock_db,
            }
        )

        assert "Food & Drink" in result
        assert "Groceries" in result
        assert "$150.50" in result
        assert "$300.00" in result
        assert "|" in result  # markdown table

    def test_spending_summary_no_transactions(self, mock_db):
        """get_spending_summary should return a message when no transactions."""
        mock_db.execute.return_value.fetchall.return_value = []

        result = get_spending_summary.run(
            {
                "user_id": "user-123",
                "db": mock_db,
            }
        )

        assert "No transactions found" in result


# ---------------------------------------------------------------------------
# compare_months
# ---------------------------------------------------------------------------


class TestCompareMonths:
    """Tests for the compare_months tool."""

    @pytest.fixture
    def mock_db(self):
        return MagicMock()

    def test_compare_months_returns_comparison(self, mock_db):
        """compare_months should return a comparison report."""
        row1 = MagicMock()
        row1.month = "2024-01"
        row1.category = "Food"
        row1.total = 100.0
        row2 = MagicMock()
        row2.month = "2024-02"
        row2.category = "Food"
        row2.total = 150.0
        mock_db.execute.return_value.fetchall.return_value = [row1, row2]

        result = compare_months.run(
            {
                "month1": "2024-01",
                "month2": "2024-02",
                "user_id": "user-123",
                "db": mock_db,
            }
        )

        assert "2024-01" in result
        assert "2024-02" in result
        assert "Change" in result

    def test_compare_months_invalid_format(self, mock_db):
        """compare_months should raise ValueError for invalid month format."""
        with pytest.raises(ValueError, match="YYYY-MM format"):
            compare_months.run(
                {
                    "month1": "invalid",
                    "month2": "2024-02",
                    "user_id": "user-123",
                    "db": mock_db,
                }
            )


# ---------------------------------------------------------------------------
# get_anomalies
# ---------------------------------------------------------------------------


class TestGetAnomalies:
    """Tests for the get_anomalies tool."""

    @pytest.fixture
    def mock_db(self):
        return MagicMock()

    def test_get_anomalies_returns_anomalies(self, mock_db):
        """get_anomalies should return formatted anomalies."""
        row = MagicMock()
        row.id = "report-1"
        row.document_id = "doc-1"
        row.insights = {"anomalies": [{"description": "Unusual $5000 charge"}]}
        mock_db.execute.return_value.fetchall.return_value = [row]

        result = get_anomalies.run(
            {
                "user_id": "user-123",
                "db": mock_db,
            }
        )

        assert "Unusual $5000 charge" in result

    def test_get_anomalies_no_reports(self, mock_db):
        """get_anomalies should return a message when no reports exist."""
        mock_db.execute.return_value.fetchall.return_value = []

        result = get_anomalies.run(
            {
                "user_id": "user-123",
                "db": mock_db,
            }
        )

        assert "No audit reports found" in result

    def test_get_anomalies_empty_anomalies(self, mock_db):
        """get_anomalies should handle reports with empty anomaly lists."""
        row = MagicMock()
        row.id = "report-1"
        row.document_id = "doc-1"
        row.insights = {"anomalies": []}
        mock_db.execute.return_value.fetchall.return_value = [row]

        result = get_anomalies.run(
            {
                "user_id": "user-123",
                "db": mock_db,
            }
        )

        assert "No anomalies found" in result
