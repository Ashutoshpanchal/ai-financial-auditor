"""LangChain tools for the AI Finance Agent.

Each tool queries the database scoped to the current authenticated user.
Tools are decorated with @tool so LangGraph can bind and invoke them automatically.

All SQL uses SQLAlchemy text() with parameterized bindings — never string interpolation.
Embeddings use the same OpenRouter model as the rest of the pipeline (openai/text-embedding-3-small).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.tools import tool
from langchain_openai import OpenAIEmbeddings
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.config import get_settings

logger = logging.getLogger(__name__)


def _build_embeddings() -> OpenAIEmbeddings:
    """Build an OpenAIEmbeddings client pointed at OpenRouter.

    Returns:
        Configured OpenAIEmbeddings instance using the embedding model from settings.
    """
    settings = get_settings()
    return OpenAIEmbeddings(
        model=settings.openrouter_embedding_model,
        openai_api_key=settings.openrouter_api_key,
        openai_api_base=settings.openrouter_base_url,
    )


def _embed_query(query: str) -> list[float]:
    """Embed a single query string using the configured OpenRouter embeddings model.

    Args:
        query: Natural language query to embed.

    Returns:
        Float vector of length matching EMBEDDING_DIM (1536 for text-embedding-3-small).

    Raises:
        RuntimeError: If the embedding API call fails.
    """
    embeddings = _build_embeddings()
    try:
        return embeddings.embed_query(query)
    except Exception as exc:
        raise RuntimeError(f"Embedding query failed: {exc}") from exc


@tool
def search_transactions(query: str, user_id: str, db: Session) -> str:
    """Find transactions relevant to a natural language query using pgvector cosine similarity.

    Embeds the query, then fetches the 10 most similar transactions for the given user.

    Args:
        query:   Natural language description of what to look for (e.g. "coffee shops").
        user_id: ID of the authenticated user whose transactions to search.
        db:      SQLAlchemy session to use for the query.

    Returns:
        Formatted multi-line string of matching transactions, or a message if none found.

    Raises:
        RuntimeError: If the embedding call or database query fails.
    """
    try:
        query_embedding = _embed_query(query)
    except RuntimeError as exc:
        raise RuntimeError(f"search_transactions: could not embed query — {exc}") from exc

    # pgvector cosine distance operator: <=>
    sql = text(
        """
        SELECT id, bank_name, transaction_date, description, amount, category
        FROM transactions
        WHERE user_id = :uid
        ORDER BY embedding <=> CAST(:qemb AS vector)
        LIMIT 10
        """
    )
    try:
        rows = db.execute(sql, {"uid": user_id, "qemb": str(query_embedding)}).fetchall()
    except Exception as exc:
        raise RuntimeError(f"search_transactions: database query failed — {exc}") from exc

    if not rows:
        return "No transactions found matching that query."

    lines: list[str] = [
        f"{'Date':<12} {'Bank':<20} {'Amount':>10}  {'Category':<20}  Description",
        "-" * 90,
    ]
    for row in rows:
        lines.append(
            f"{row.transaction_date!s:<12} "
            f"{(row.bank_name or ''):<20} "
            f"${row.amount:>9.2f}  "
            f"{(row.category or 'Uncategorized'):<20}  "
            f"{row.description}"
        )

    return "\n".join(lines)


@tool
def get_spending_summary(user_id: str, db: Session) -> str:
    """Aggregate total spend per category for all of the user's transactions.

    Args:
        user_id: ID of the authenticated user.
        db:      SQLAlchemy session.

    Returns:
        Markdown table with two columns: Category and Total Spend (descending by spend).
        Returns a plain message if the user has no transactions.

    Raises:
        RuntimeError: If the database query fails.
    """
    sql = text(
        """
        SELECT
            COALESCE(category, 'Uncategorized') AS category,
            SUM(amount) AS total
        FROM transactions
        WHERE user_id = :uid
        GROUP BY COALESCE(category, 'Uncategorized')
        ORDER BY total DESC
        """
    )
    try:
        rows = db.execute(sql, {"uid": user_id}).fetchall()
    except Exception as exc:
        raise RuntimeError(f"get_spending_summary: database query failed — {exc}") from exc

    if not rows:
        return "No transactions found for this user."

    lines: list[str] = [
        "| Category | Total Spend |",
        "|----------|-------------|",
    ]
    for row in rows:
        lines.append(f"| {row.category} | ${row.total:,.2f} |")

    return "\n".join(lines)


@tool
def compare_months(month1: str, month2: str, user_id: str, db: Session) -> str:
    """Compare total spend and category breakdown between two calendar months.

    Args:
        month1:  First month in "YYYY-MM" format (e.g. "2024-01").
        month2:  Second month in "YYYY-MM" format (e.g. "2024-02").
        user_id: ID of the authenticated user.
        db:      SQLAlchemy session.

    Returns:
        Plain-text comparison report including totals and per-category breakdown.

    Raises:
        ValueError:   If month strings are not in "YYYY-MM" format.
        RuntimeError: If the database query fails.
    """
    import re

    month_pattern = re.compile(r"^\d{4}-\d{2}$")
    if not month_pattern.match(month1):
        raise ValueError(f"compare_months: month1 '{month1}' must be in YYYY-MM format")
    if not month_pattern.match(month2):
        raise ValueError(f"compare_months: month2 '{month2}' must be in YYYY-MM format")

    sql = text(
        """
        SELECT
            TO_CHAR(transaction_date, 'YYYY-MM') AS month,
            COALESCE(category, 'Uncategorized') AS category,
            SUM(amount) AS total
        FROM transactions
        WHERE user_id = :uid
          AND TO_CHAR(transaction_date, 'YYYY-MM') IN (:m1, :m2)
        GROUP BY TO_CHAR(transaction_date, 'YYYY-MM'), COALESCE(category, 'Uncategorized')
        ORDER BY month, total DESC
        """
    )
    try:
        rows = db.execute(sql, {"uid": user_id, "m1": month1, "m2": month2}).fetchall()
    except Exception as exc:
        raise RuntimeError(f"compare_months: database query failed — {exc}") from exc

    # Organise results into {month: {category: total}}
    data: dict[str, dict[str, float]] = {month1: {}, month2: {}}
    for row in rows:
        data[row.month][row.category] = float(row.total)

    def _month_total(month_data: dict[str, float]) -> float:
        return sum(month_data.values())

    total1 = _month_total(data[month1])
    total2 = _month_total(data[month2])
    delta = total2 - total1
    delta_pct = (delta / total1 * 100) if total1 != 0 else 0.0

    lines: list[str] = [
        f"Spending comparison: {month1} vs {month2}",
        "=" * 50,
        f"  {month1} total: ${total1:,.2f}",
        f"  {month2} total: ${total2:,.2f}",
        f"  Change:         ${delta:+,.2f} ({delta_pct:+.1f}%)",
        "",
        "Category breakdown:",
        f"  {'Category':<25} {month1:>10}  {month2:>10}  {'Change':>12}",
        "  " + "-" * 62,
    ]

    all_categories = sorted(set(data[month1]) | set(data[month2]))
    for cat in all_categories:
        v1 = data[month1].get(cat, 0.0)
        v2 = data[month2].get(cat, 0.0)
        diff = v2 - v1
        lines.append(
            f"  {cat:<25} ${v1:>9,.2f}  ${v2:>9,.2f}  ${diff:>+10,.2f}"
        )

    return "\n".join(lines)


@tool
def get_anomalies(user_id: str, db: Session) -> str:
    """Fetch all audit reports for the user and extract anomalies from their insights JSON.

    Args:
        user_id: ID of the authenticated user.
        db:      SQLAlchemy session.

    Returns:
        Formatted list of anomalies across all audit reports, grouped by report/document.
        Returns a plain message if no anomalies are recorded.

    Raises:
        RuntimeError: If the database query fails.
    """
    sql = text(
        """
        SELECT id, document_id, insights
        FROM audit_reports
        WHERE user_id = :uid
        ORDER BY created_at DESC
        """
    )
    try:
        rows = db.execute(sql, {"uid": user_id}).fetchall()
    except Exception as exc:
        raise RuntimeError(f"get_anomalies: database query failed — {exc}") from exc

    if not rows:
        return "No audit reports found for this user."

    all_anomalies: list[str] = []
    for row in rows:
        insights: Any = row.insights
        # insights may already be a dict (SQLAlchemy JSON column) or a raw string
        if isinstance(insights, str):
            try:
                insights = json.loads(insights)
            except json.JSONDecodeError:
                logger.warning("Audit report %s has non-JSON insights field; skipping", row.id)
                continue

        anomalies: list[Any] = insights.get("anomalies", []) if isinstance(insights, dict) else []
        if anomalies:
            all_anomalies.append(f"Report for document {row.document_id}:")
            for item in anomalies:
                # Anomalies may be dicts or strings depending on the LLM output schema
                if isinstance(item, dict):
                    desc = item.get("description") or item.get("detail") or str(item)
                else:
                    desc = str(item)
                all_anomalies.append(f"  - {desc}")

    if not all_anomalies:
        return "No anomalies found across all audit reports."

    return "\n".join(all_anomalies)
