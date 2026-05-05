-- ============================================================
-- Row Level Security — users see only their own rows
-- App connects as 'app_user'; super_admin bypasses RLS
-- ============================================================

ALTER TABLE documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions  ENABLE ROW LEVEL SECURITY;

-- Policy: users see only their own rows (app sets app.current_user_id session var)
CREATE POLICY user_isolation ON documents
    USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY user_isolation ON transactions
    USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY user_isolation ON audit_reports
    USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY user_isolation ON chat_sessions
    USING (user_id = current_setting('app.current_user_id', true));

-- TODO: Create a limited 'app_user' role for production and grant only necessary privileges
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
