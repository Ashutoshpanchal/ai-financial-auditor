-- ============================================================
-- Add file_hash to documents for duplicate detection
-- ============================================================

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS file_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ix_documents_user_file_hash
    ON documents (user_id, file_hash)
    WHERE file_hash IS NOT NULL;
