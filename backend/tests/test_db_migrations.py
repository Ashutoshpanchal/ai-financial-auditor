"""Tests for ``backend.db_migrations`` — SQL splitting and category seed parsing."""

from __future__ import annotations

from pathlib import Path

from backend.db_migrations import (
    parse_category_master_seed_pairs,
    split_sql_migration_statements,
)


def test_split_sql_migration_statements_keeps_dollar_block_single_statement() -> None:
    """``DO $$ ... $$;`` must stay one executable unit (PostgreSQL dollar-quoting)."""
    sql = Path("migrations/009_unique_description_categories.sql").read_text(
        encoding="utf-8"
    )
    parts = split_sql_migration_statements(sql)
    assert len(parts) == 1
    assert "DO $$" in parts[0]
    assert "$$;" in parts[0]


def test_split_sql_migration_statements_splits_007_into_multiple() -> None:
    """``007_categories.sql`` contains several DDL/INSERT statements."""
    sql = Path("migrations/007_categories.sql").read_text(encoding="utf-8")
    parts = split_sql_migration_statements(sql)
    assert len(parts) >= 3


def test_parse_category_master_seed_pairs_parses_007_file() -> None:
    """INSERT rows in ``007_categories.sql`` yield ``(parent, sub)`` pairs."""
    sql = Path("migrations/007_categories.sql").read_text(encoding="utf-8")
    pairs = parse_category_master_seed_pairs(sql)
    assert len(pairs) >= 30
    assert ("Food & Dining", "Swiggy") in pairs
