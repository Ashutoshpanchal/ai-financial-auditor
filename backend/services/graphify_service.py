"""Graphify service — converts audit output into a knowledge graph.

Flow:
  audit result dict → temp folder with structured .md files
  → graphify pipeline (detect → extract → build → cluster → export)
  → returns graph_json (stored in DB) + graph_html (served to frontend)
"""

from __future__ import annotations

import json
import logging
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


def build_audit_graph(
    audit_result: dict,
    user_id: str,
    document_id: str,
) -> tuple[dict, str]:
    """Run graphify on an audit result dict and return (graph_json, graph_html_string).

    Creates a temp directory with structured markdown files from the audit data,
    runs the full graphify pipeline, and returns the outputs for storage and serving.

    Args:
        audit_result: Structured audit output with keys: summary, categories,
                      transactions, anomalies, recommendations.
        user_id:      Used to namespace temp files.
        document_id:  Used to name the temp directory.

    Returns:
        Tuple of (graph_json dict, graph_html string).
        Returns ({}, '') if graphify pipeline fails — never raises.
    """
    try:
        return _run_graphify_pipeline(audit_result, document_id)
    except Exception as exc:
        logger.error(
            "Graphify pipeline failed for document %s: %s",
            document_id,
            exc,
            exc_info=True,
        )
        return {}, ""


def _run_graphify_pipeline(audit_result: dict, document_id: str) -> tuple[dict, str]:
    """Internal — writes audit data to temp files and runs the graphify pipeline."""
    from graphify.build import build_from_json
    from graphify.cluster import cluster
    from graphify.detect import detect
    from graphify.export import to_html, to_json

    with tempfile.TemporaryDirectory(prefix=f"graphify_{document_id}_") as tmp_dir:
        tmp_path = Path(tmp_dir)
        out_path = tmp_path / "graphify-out"
        out_path.mkdir()

        # Write audit data as structured markdown files that graphify can parse
        _write_corpus_files(audit_result, tmp_path)

        # Run detect → extract → build → cluster → export
        detection = detect(tmp_path)
        if detection.get("total_files", 0) == 0:
            logger.warning("Graphify detected no files in audit corpus")
            return {}, ""

        # AST extraction (code-only, skipped for markdown) + semantic extraction
        extraction = _extract(tmp_path, detection)

        G = build_from_json(extraction)
        if G.number_of_nodes() == 0:
            logger.warning("Graphify produced empty graph for document %s", document_id)
            return {}, ""

        communities = cluster(G)
        to_json(G, communities, str(out_path / "graph.json"))
        to_html(G, communities, str(out_path / "graph.html"))

        graph_json = json.loads((out_path / "graph.json").read_text())
        graph_html = (
            (out_path / "graph.html").read_text()
            if (out_path / "graph.html").exists()
            else ""
        )

        logger.info(
            "Graphify complete: %d nodes, %d edges, %d communities",
            G.number_of_nodes(),
            G.number_of_edges(),
            len(communities),
        )
        return graph_json, graph_html


def _write_corpus_files(audit_result: dict, out_dir: Path) -> None:
    """Write audit data as structured markdown files for graphify to process."""
    # Summary document
    summary_text = f"""# Financial Audit Summary

{audit_result.get("summary", "")}

## Key Metrics
- Total transactions: {audit_result.get("total_transactions", 0)}
- Date range: {audit_result.get("date_range", "unknown")}
- Bank: {audit_result.get("bank_name", "unknown")}
"""
    (out_dir / "summary.md").write_text(summary_text)

    # Spending categories document
    categories = audit_result.get("categories", {})
    if categories:
        cat_lines = ["# Spending Categories\n"]
        for cat, amount in sorted(categories.items(), key=lambda x: x[1], reverse=True):
            cat_lines.append(f"## {cat}\nTotal spent: ${amount:.2f}\n")
        (out_dir / "categories.md").write_text("\n".join(cat_lines))

    # Anomalies document
    anomalies = audit_result.get("anomalies", [])
    if anomalies:
        anom_lines = ["# Anomalies Detected\n"]
        for a in anomalies:
            anom_lines.append(f"## {a.get('description', 'Unknown anomaly')}\n")
            anom_lines.append(f"- Date: {a.get('date', '')}\n")
            anom_lines.append(f"- Amount: ${a.get('amount', 0):.2f}\n")
            anom_lines.append(f"- Reason: {a.get('reason', '')}\n")
        (out_dir / "anomalies.md").write_text("\n".join(anom_lines))

    # Recommendations document
    recommendations = audit_result.get("recommendations", [])
    if recommendations:
        rec_lines = ["# Financial Recommendations\n"]
        for i, rec in enumerate(recommendations, 1):
            rec_lines.append(f"## Recommendation {i}\n{rec}\n")
        (out_dir / "recommendations.md").write_text("\n".join(rec_lines))

    # Top merchants document — useful for merchant-level graph nodes
    merchants = audit_result.get("top_merchants", [])
    if merchants:
        merch_lines = ["# Top Merchants\n"]
        for m in merchants:
            merch_lines.append(
                f"## {m.get('name', 'Unknown')}\n"
                f"- Category: {m.get('category', '')}\n"
                f"- Total: ${m.get('total', 0):.2f}\n"
                f"- Transactions: {m.get('count', 0)}\n"
            )
        (out_dir / "merchants.md").write_text("\n".join(merch_lines))


def _extract(input_path: Path, detection: dict) -> dict:
    """Run AST extraction (skips for markdown) — semantic extraction via graphify CLI.

    For markdown-only corpora we use graphify's built-in extract directly.
    """
    from graphify.extract import extract

    doc_files = [Path(f) for f in detection.get("files", {}).get("document", [])]
    if not doc_files:
        return {
            "nodes": [],
            "edges": [],
            "hyperedges": [],
            "input_tokens": 0,
            "output_tokens": 0,
        }

    result = extract(doc_files)
    return result
