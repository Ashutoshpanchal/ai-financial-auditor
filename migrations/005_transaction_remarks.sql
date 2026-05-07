-- ============================================================
-- Add remarks column to transactions for parsed description parts
-- ============================================================

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS remarks JSONB;
