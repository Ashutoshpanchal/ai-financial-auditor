-- Migration 006: replace signed `amount` with separate debit / credit columns.
-- debit  = money out (positive value, 0 when not applicable)
-- credit = money in  (positive value, 0 when not applicable)

ALTER TABLE transactions DROP COLUMN IF EXISTS amount;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS debit  FLOAT NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS credit FLOAT NOT NULL DEFAULT 0;
