-- Ensure the unique constraint on (user_id, description) exists for upsert operations.
-- The ON CONFLICT clause in analyze_and_categorize() requires this constraint.
-- Uses IF NOT EXISTS so it is safe to re-run even if the constraint already exists.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'description_categories'::regclass
          AND contype = 'u'
          AND conname = 'uq_description_categories_user_description'
    ) THEN
        ALTER TABLE description_categories
            ADD CONSTRAINT uq_description_categories_user_description
            UNIQUE (user_id, description);
    END IF;
END
$$;
