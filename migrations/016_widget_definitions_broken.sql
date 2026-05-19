-- Persist broken state when hardcoded category/subcategory no longer exists
ALTER TABLE widget_definitions
    ADD COLUMN IF NOT EXISTS broken BOOLEAN NOT NULL DEFAULT FALSE;
