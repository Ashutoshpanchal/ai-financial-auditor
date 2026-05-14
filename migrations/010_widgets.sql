-- ============================================================
-- user_widgets: per-user saved chart/query widgets
-- user_dashboards: per-user dashboard layout config
-- RLS enabled on both tables
-- ============================================================

CREATE TABLE IF NOT EXISTS user_widgets (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        VARCHAR(255) NOT NULL,
    widget_type  VARCHAR(50) NOT NULL,
    query_config JSONB NOT NULL,
    is_default   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_widgets_user_id ON user_widgets(user_id);

CREATE TABLE IF NOT EXISTS user_dashboards (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    layout     JSONB NOT NULL DEFAULT '{"cols": 3, "grid": []}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_widgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON user_widgets
    USING (user_id = current_setting('app.current_user_id', true));

ALTER TABLE user_dashboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON user_dashboards
    USING (user_id = current_setting('app.current_user_id', true));
