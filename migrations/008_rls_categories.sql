-- Row Level Security for description_categories
-- Users may only read/write their own rows.

ALTER TABLE description_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_isolation ON description_categories
    USING (user_id = current_setting('app.current_user_id', true));
