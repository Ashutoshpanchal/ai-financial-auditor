-- Widget Studio: persist in-progress widget spec alongside chat history.
ALTER TABLE chat_sessions
    ADD COLUMN IF NOT EXISTS draft_state JSONB;
