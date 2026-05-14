-- category_master: global parent/sub-category dictionary (pre-seeded)
CREATE TABLE IF NOT EXISTS category_master (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_category VARCHAR(100) NOT NULL,
    sub_category    VARCHAR(100) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ,
    updated_by      VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(parent_category, sub_category)
);

-- Explicit ids: tables created by ORM create_all may use VARCHAR id without a server default,
-- so relying on DEFAULT gen_random_uuid() on INSERT (parent, sub) alone can yield NULL id.
INSERT INTO category_master (id, parent_category, sub_category) VALUES
  (gen_random_uuid(), 'Food & Dining', 'Swiggy'), (gen_random_uuid(), 'Food & Dining', 'Zomato'), (gen_random_uuid(), 'Food & Dining', 'Blinkit'),
  (gen_random_uuid(), 'Food & Dining', 'Uber Eats'), (gen_random_uuid(), 'Food & Dining', 'Other'),
  (gen_random_uuid(), 'Entertainment', 'Netflix'), (gen_random_uuid(), 'Entertainment', 'Spotify'), (gen_random_uuid(), 'Entertainment', 'Prime Video'),
  (gen_random_uuid(), 'Entertainment', 'Hotstar'), (gen_random_uuid(), 'Entertainment', 'Other'),
  (gen_random_uuid(), 'Shopping', 'Amazon'), (gen_random_uuid(), 'Shopping', 'Flipkart'), (gen_random_uuid(), 'Shopping', 'Myntra'),
  (gen_random_uuid(), 'Shopping', 'Meesho'), (gen_random_uuid(), 'Shopping', 'Other'),
  (gen_random_uuid(), 'Transport', 'Uber'), (gen_random_uuid(), 'Transport', 'Ola'), (gen_random_uuid(), 'Transport', 'Metro'),
  (gen_random_uuid(), 'Transport', 'Rapido'), (gen_random_uuid(), 'Transport', 'Other'),
  (gen_random_uuid(), 'Utilities', 'Electricity'), (gen_random_uuid(), 'Utilities', 'Water'), (gen_random_uuid(), 'Utilities', 'Gas'),
  (gen_random_uuid(), 'Utilities', 'Internet'), (gen_random_uuid(), 'Utilities', 'Mobile Recharge'), (gen_random_uuid(), 'Utilities', 'Other'),
  (gen_random_uuid(), 'Healthcare', 'Pharmacy'), (gen_random_uuid(), 'Healthcare', 'Hospital'), (gen_random_uuid(), 'Healthcare', 'Doctor'), (gen_random_uuid(), 'Healthcare', 'Other'),
  (gen_random_uuid(), 'Education', 'Courses'), (gen_random_uuid(), 'Education', 'Books'), (gen_random_uuid(), 'Education', 'Tuition'),
  (gen_random_uuid(), 'Rent & EMI', 'House Rent'), (gen_random_uuid(), 'Rent & EMI', 'Loan EMI'), (gen_random_uuid(), 'Rent & EMI', 'Credit Card EMI'), (gen_random_uuid(), 'Rent & EMI', 'Other'),
  (gen_random_uuid(), 'Income', 'Salary'), (gen_random_uuid(), 'Income', 'Freelance'), (gen_random_uuid(), 'Income', 'Dividend'), (gen_random_uuid(), 'Income', 'Other'),
  (gen_random_uuid(), 'Transfers', 'Bank Transfer'), (gen_random_uuid(), 'Transfers', 'Wallet Transfer'), (gen_random_uuid(), 'Transfers', 'Other'),
  (gen_random_uuid(), 'Other', 'Miscellaneous')
ON CONFLICT DO NOTHING;

-- description_categories: per-user LLM-generated + user-editable mappings
CREATE TABLE IF NOT EXISTS description_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description     TEXT NOT NULL,
    parent_category VARCHAR(100),
    sub_category    VARCHAR(100),
    payment_method  VARCHAR(50),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ,
    updated_by      VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(user_id, description)
);
