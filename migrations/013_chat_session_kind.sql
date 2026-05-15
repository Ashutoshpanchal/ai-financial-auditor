-- Tag chat sessions for Widget Studio vs general dashboard chat.
ALTER TABLE chat_sessions
    ADD COLUMN IF NOT EXISTS session_kind TEXT NOT NULL DEFAULT 'general';

CREATE INDEX IF NOT EXISTS ix_chat_sessions_user_kind
    ON chat_sessions (user_id, session_kind);
