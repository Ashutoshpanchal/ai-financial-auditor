"""Generate pgvector embeddings for transactions using the OpenRouter API."""

from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from openai import OpenAI

from backend.config import get_settings
from backend.models.transaction import Transaction

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_BATCH_SIZE = 100  # OpenRouter rate-limit-friendly batch size


def _build_text(t: dict) -> str:
    """Build a single text representation of a transaction for embedding.

    Combines date, description, category, amount, and bank name into a
    concise string that captures all semantically relevant fields.

    Args:
        t: Transaction dict with keys ``date``, ``description``, ``category``,
           ``amount``, and ``bank_name``.

    Returns:
        A formatted string suitable for passing to the embeddings model.
    """
    category_part = t["category"] or ""
    debit = t.get("debit", 0.0)
    credit = t.get("credit", 0.0)
    amount_str = f"-${debit:.2f}" if debit > 0 else f"+${credit:.2f}"
    return (
        f"{t['date']} {t['description']} {category_part} {amount_str} {t['bank_name']}"
    ).strip()


def _get_embeddings_batch(
    client: OpenAI, texts: list[str], model: str
) -> list[list[float]]:
    """Request embeddings for a single batch of texts from OpenRouter.

    Args:
        client: Configured ``openai.OpenAI`` client pointed at OpenRouter.
        texts: Non-empty list of text strings to embed (max ``_BATCH_SIZE``).
        model: Embedding model identifier, e.g. ``"openai/text-embedding-3-small"``.

    Returns:
        List of embedding vectors in the same order as *texts*.

    Raises:
        ValueError: If the API returns a different number of embeddings than
            the number of texts supplied.
        RuntimeError: If the OpenRouter API call fails for any reason.
    """
    try:
        response = client.embeddings.create(input=texts, model=model)
    except Exception as exc:
        raise RuntimeError(f"OpenRouter embeddings API call failed: {exc}") from exc

    vectors = [item.embedding for item in response.data]
    if len(vectors) != len(texts):
        raise ValueError(
            f"Embedding count mismatch: sent {len(texts)} texts, "
            f"received {len(vectors)} embeddings."
        )
    return vectors


def _upsert_transaction(
    db: Session,
    *,
    tx_data: dict,
    embedding: list[float],
    document_id: str,
    user_id: str,
) -> None:
    """Insert or update a single Transaction row in the database.

    Looks up an existing row by ``document_id`` + ``description`` + ``date``
    + ``amount``. If found, updates the embedding (and other fields); if not,
    inserts a new row with a fresh UUID.

    Args:
        db: Active SQLAlchemy ``Session``.
        tx_data: Transaction dict (``date``, ``description``, ``amount``,
                 ``bank_name``, ``category``).
        embedding: Vector to store in the ``embedding`` column.
        document_id: FK reference to the parent document record.
        user_id: FK reference to the owning user record.
    """
    existing: Transaction | None = (
        db.query(Transaction)
        .filter(
            Transaction.document_id == document_id,
            Transaction.description == tx_data["description"],
            Transaction.transaction_date == tx_data["date"],
            Transaction.debit == float(tx_data.get("debit", 0.0)),
            Transaction.credit == float(tx_data.get("credit", 0.0)),
        )
        .first()
    )

    if existing is not None:
        existing.embedding = embedding
        existing.category = tx_data.get("category")
        existing.bank_name = tx_data["bank_name"]
    else:
        db.add(
            Transaction(
                id=str(uuid.uuid4()),
                user_id=user_id,
                document_id=document_id,
                bank_name=tx_data["bank_name"],
                transaction_date=tx_data["date"],
                description=tx_data["description"],
                debit=float(tx_data.get("debit", 0.0)),
                credit=float(tx_data.get("credit", 0.0)),
                category=tx_data.get("category"),
                embedding=embedding,
            )
        )


def embed_transactions(
    transactions: list[dict],
    db: Session,
    document_id: str,
    user_id: str,
) -> int:
    """Generate embeddings for every transaction and persist them to the database.

    Processes transactions in batches of ``_BATCH_SIZE`` to respect OpenRouter
    rate limits. Each transaction is upserted — updated if a matching row
    already exists for *document_id*, inserted otherwise.

    Args:
        transactions: List of transaction dicts produced by the CSV/PDF parsers.
            Each dict must have: ``date``, ``description``, ``amount``,
            ``bank_name``, and ``category``.
        db: Active SQLAlchemy ``Session`` (not committed here; caller decides).
        document_id: ID of the parent ``Document`` record.
        user_id: ID of the owning ``User`` record.

    Returns:
        Total number of transactions embedded and persisted.

    Raises:
        RuntimeError: If the OpenRouter embeddings API call fails.
        ValueError: If the API returns an unexpected number of embeddings.
    """
    if not transactions:
        logger.info(
            "embed_transactions called with an empty transaction list — nothing to do."
        )
        return 0

    settings = get_settings()

    client = OpenAI(
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
    )

    total_embedded = 0

    for batch_start in range(0, len(transactions), _BATCH_SIZE):
        batch = transactions[batch_start : batch_start + _BATCH_SIZE]
        texts = [_build_text(t) for t in batch]

        logger.debug(
            "Requesting embeddings for batch %d–%d (size %d).",
            batch_start,
            batch_start + len(batch) - 1,
            len(batch),
        )

        vectors = _get_embeddings_batch(
            client, texts, settings.openrouter_embedding_model
        )

        for tx_data, embedding in zip(batch, vectors, strict=False):
            _upsert_transaction(
                db,
                tx_data=tx_data,
                embedding=embedding,
                document_id=document_id,
                user_id=user_id,
            )

        db.flush()
        total_embedded += len(batch)
        logger.info("Embedded %d / %d transactions.", total_embedded, len(transactions))

    return total_embedded
