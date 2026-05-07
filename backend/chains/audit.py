"""LangChain audit pipeline — parses transactions, audits via OpenRouter LLM, runs Graphify.

Pipeline:
  transactions list
    → format as text
    → OpenRouter LLM (audit prompt)
    → parse JSON response
    → embed transactions to pgvector
    → Graphify knowledge graph
    → AuditReport dict
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import TYPE_CHECKING

from langchain_openai import ChatOpenAI

from backend.config import get_settings
from backend.models.audit_report import AuditReport
from backend.models.document import Document, DocumentStatus
from backend.prompts.audit_prompt import audit_prompt
from backend.services.graphify_service import build_audit_graph
from backend.services.observability import get_callbacks

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def _build_llm() -> ChatOpenAI:
    """Build LangChain LLM client pointed at OpenRouter."""
    settings = get_settings()
    return ChatOpenAI(
        model=settings.openrouter_model,
        openai_api_key=settings.openrouter_api_key,
        openai_api_base=settings.openrouter_base_url,
        temperature=0.1,  # low temp for consistent structured output
        max_tokens=4096,
    )


def _format_transactions(transactions: list[dict]) -> str:
    """Convert transaction dicts to a readable text block for the LLM prompt."""
    lines = ["Date | Description | Debit | Credit | Category"]
    lines.append("-" * 60)
    for t in transactions:
        debit = t.get("debit", 0.0)
        credit = t.get("credit", 0.0)
        lines.append(
            f"{t.get('date', '')} | {t.get('description', '')} | "
            f"${debit:.2f} | ${credit:.2f} | {t.get('category', 'Uncategorized')}"
        )
    return "\n".join(lines)


def _parse_llm_response(response_text: str) -> dict:
    """Extract JSON from LLM response, stripping any markdown fences."""
    text = response_text.strip()
    # Strip ```json fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"LLM returned invalid JSON: {exc}\nResponse: {response_text[:500]}"
        ) from exc


async def run_audit(
    db: Session,
    document: Document,
    transactions: list[dict],
    user_id: str,
) -> AuditReport:
    """Run the full audit pipeline for a document.

    Steps:
      1. Format transactions for LLM
      2. Run LangChain audit chain with OpenRouter LLM
      3. Parse structured audit result
      4. Run Graphify to build spending knowledge graph
      5. Persist AuditReport to database

    Args:
        db:           SQLAlchemy session (caller manages transaction).
        document:     Document ORM object being audited.
        transactions: List of transaction dicts from the parser.
        user_id:      Owner user ID.

    Returns:
        Persisted AuditReport ORM object.

    Raises:
        ValueError: If the LLM returns malformed JSON.
        Exception:  Propagates unexpected errors after updating document status.
    """
    get_settings()
    llm = _build_llm()
    callbacks = get_callbacks()

    # Update document status
    document.status = DocumentStatus.auditing
    db.commit()

    date_range = _get_date_range(transactions)
    transactions_text = _format_transactions(transactions)

    # Build and invoke the LangChain chain
    chain = audit_prompt | llm
    try:
        response = await chain.ainvoke(
            {
                "bank_name": document.bank_name,
                "date_range": date_range,
                "transaction_count": len(transactions),
                "transactions_text": transactions_text,
            },
            config={"callbacks": callbacks},
        )
    except Exception as exc:
        document.status = DocumentStatus.failed
        document.error_message = f"LLM audit failed: {exc}"
        db.commit()
        raise

    audit_result = _parse_llm_response(response.content)
    audit_result["date_range"] = date_range
    audit_result["bank_name"] = document.bank_name
    audit_result["total_transactions"] = len(transactions)

    # Run Graphify — non-blocking, failures produce empty graph but don't fail the audit
    logger.info("Running Graphify for document %s", document.id)
    graph_json, graph_html = build_audit_graph(audit_result, user_id, document.id)

    # Store graph_html path (save to disk) so frontend can fetch it
    graph_html_path = _save_graph_html(graph_html, document.id) if graph_html else None

    # Persist audit report
    report = AuditReport(
        id=str(uuid.uuid4()),
        user_id=user_id,
        document_id=document.id,
        summary=audit_result.get("summary", ""),
        insights={
            "categories": audit_result.get("categories", {}),
            "top_merchants": audit_result.get("top_merchants", []),
            "anomalies": audit_result.get("anomalies", []),
            "recommendations": audit_result.get("recommendations", []),
            "monthly_totals": audit_result.get("monthly_totals", {}),
            "graph_html_path": graph_html_path,
        },
        graph_json=graph_json if graph_json else None,
    )

    document.status = DocumentStatus.completed
    db.add(report)
    db.commit()
    db.refresh(report)

    logger.info(
        "Audit complete for document %s: %d categories, %d anomalies, graph=%s",
        document.id,
        len(audit_result.get("categories", {})),
        len(audit_result.get("anomalies", [])),
        "yes" if graph_json else "no",
    )
    return report


def _get_date_range(transactions: list[dict]) -> str:
    """Extract date range string from transaction list."""
    dates = [t.get("date") for t in transactions if t.get("date")]
    if not dates:
        return "unknown"
    return f"{min(dates)} to {max(dates)}"


def _save_graph_html(html_content: str, document_id: str) -> str:
    """Save Graphify HTML to a static path and return the relative URL path.

    TODO: Move to object storage (S3/Drive) in production.
    """
    static_dir = Path("static/graphs")
    static_dir.mkdir(parents=True, exist_ok=True)
    html_path = static_dir / f"{document_id}.html"
    html_path.write_text(html_content)
    return f"/static/graphs/{document_id}.html"


from pathlib import (
    Path,  # imported here to avoid circular reference with top-level imports
)
