-- Per-user description → category rules (AI Sync + Sync categories).
CREATE TABLE IF NOT EXISTS category_rules (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_type       VARCHAR(20) NOT NULL DEFAULT 'exact',
    pattern          TEXT NOT NULL,
    priority         INTEGER NOT NULL DEFAULT 0,
    parent_category  VARCHAR(100) NOT NULL,
    sub_category     VARCHAR(100) NOT NULL,
    payment_method   VARCHAR(50),
    enabled          BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ,
    updated_by       VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (user_id, match_type, pattern)
);

CREATE INDEX IF NOT EXISTS ix_category_rules_user_id ON category_rules (user_id);

ALTER TABLE category_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS category_rules_user_isolation ON category_rules;

CREATE POLICY category_rules_user_isolation ON category_rules
    USING (user_id = current_setting('app.current_user_id', true));
