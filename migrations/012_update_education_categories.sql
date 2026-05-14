-- Update Education category sub-categories to Courses, Books, Tuition
DELETE FROM category_master WHERE parent_category = 'Education';

INSERT INTO category_master (id, parent_category, sub_category) VALUES
  (gen_random_uuid(), 'Education', 'Courses'),
  (gen_random_uuid(), 'Education', 'Books'),
  (gen_random_uuid(), 'Education', 'Tuition')
ON CONFLICT DO NOTHING;
