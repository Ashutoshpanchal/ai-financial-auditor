-- ============================================================
-- Widget Studio: definitions, chat sessions/messages, agent logs
-- Uses TEXT user ids (matches users.id). RLS on user-owned tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS widget_definitions (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    type            VARCHAR(50) NOT NULL,
    intent_text     TEXT NOT NULL,
    abstract_query  TEXT NOT NULL,
    resolved_query  TEXT NOT NULL,
    hardcoded_filters JSONB,
    chart_config    JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_widget_definitions_user_id
    ON widget_definitions(user_id);

CREATE TABLE IF NOT EXISTS widget_chat_sessions (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    widget_id   TEXT REFERENCES widget_definitions(id) ON DELETE SET NULL,
    title       VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted  BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_widget_chat_sessions_user_id
    ON widget_chat_sessions(user_id);

CREATE TABLE IF NOT EXISTS widget_chat_messages (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id  TEXT NOT NULL REFERENCES widget_chat_sessions(id) ON DELETE CASCADE,
    role        VARCHAR(20) NOT NULL,
    content     TEXT NOT NULL,
    agent_name  VARCHAR(50),
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_widget_chat_messages_session_id
    ON widget_chat_messages(session_id);

CREATE TABLE IF NOT EXISTS widget_agent_logs (
    id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id        TEXT NOT NULL REFERENCES widget_chat_sessions(id) ON DELETE CASCADE,
    agent_name        VARCHAR(100) NOT NULL,
    input             JSONB,
    output            JSONB,
    raw_query         TEXT,
    translated_query  TEXT,
    execution_result  JSONB,
    error             TEXT,
    duration_ms       INTEGER,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_widget_agent_logs_session_id
    ON widget_agent_logs(session_id);

ALTER TABLE widget_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_isolation ON widget_definitions
    USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY user_isolation ON widget_chat_sessions
    USING (user_id = current_setting('app.current_user_id', true));
