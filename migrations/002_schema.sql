-- ============================================================
-- Full schema: users, documents, transactions, audit_reports,
-- chat_sessions — with RLS enabled on all tables
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    google_id   TEXT UNIQUE NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    picture     TEXT,
    role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('super_admin', 'admin', 'user')),
    google_access_token  TEXT,
    google_refresh_token TEXT,
    token_expires_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename        TEXT NOT NULL,
    bank_name       TEXT NOT NULL,
    file_type       TEXT NOT NULL CHECK (file_type IN ('csv', 'pdf')),
    drive_file_id   TEXT NOT NULL,
    drive_folder_id TEXT NOT NULL,
    drive_web_url   TEXT,
    status          TEXT NOT NULL DEFAULT 'uploaded'
                    CHECK (status IN ('uploaded','parsing','parsed','embedding','auditing','completed','failed')),
    error_message   TEXT,
    upload_date     TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_documents_user_id ON documents(user_id);

CREATE TABLE IF NOT EXISTS transactions (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id      TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    bank_name        TEXT NOT NULL,
    transaction_date DATE NOT NULL,
    description      TEXT NOT NULL,
    amount           NUMERIC(12,2) NOT NULL,
    category         TEXT,
    embedding        vector(1536),  -- openai/text-embedding-3-small
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_transactions_user_id ON transactions(user_id);
-- HNSW index for fast pgvector similarity search
CREATE INDEX IF NOT EXISTS ix_transactions_embedding ON transactions
    USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS audit_reports (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
    summary     TEXT NOT NULL,
    insights    JSONB NOT NULL DEFAULT '{}',
    graph_json  JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_audit_reports_user_id ON audit_reports(user_id);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT,
    messages   JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_chat_sessions_user_id ON chat_sessions(user_id);
