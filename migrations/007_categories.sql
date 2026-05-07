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

INSERT INTO category_master (parent_category, sub_category) VALUES
  ('Food & Dining', 'Swiggy'), ('Food & Dining', 'Zomato'), ('Food & Dining', 'Blinkit'),
  ('Food & Dining', 'Uber Eats'), ('Food & Dining', 'Other'),
  ('Entertainment', 'Netflix'), ('Entertainment', 'Spotify'), ('Entertainment', 'Prime Video'),
  ('Entertainment', 'Hotstar'), ('Entertainment', 'Other'),
  ('Shopping', 'Amazon'), ('Shopping', 'Flipkart'), ('Shopping', 'Myntra'),
  ('Shopping', 'Meesho'), ('Shopping', 'Other'),
  ('Transport', 'Uber'), ('Transport', 'Ola'), ('Transport', 'Metro'),
  ('Transport', 'Rapido'), ('Transport', 'Other'),
  ('Utilities', 'Electricity'), ('Utilities', 'Water'), ('Utilities', 'Gas'),
  ('Utilities', 'Internet'), ('Utilities', 'Mobile Recharge'), ('Utilities', 'Other'),
  ('Healthcare', 'Pharmacy'), ('Healthcare', 'Hospital'), ('Healthcare', 'Doctor'), ('Healthcare', 'Other'),
  ('Education', 'School Fees'), ('Education', 'Online Course'), ('Education', 'Books'), ('Education', 'Other'),
  ('Rent & EMI', 'House Rent'), ('Rent & EMI', 'Loan EMI'), ('Rent & EMI', 'Credit Card EMI'), ('Rent & EMI', 'Other'),
  ('Income', 'Salary'), ('Income', 'Freelance'), ('Income', 'Dividend'), ('Income', 'Other'),
  ('Transfers', 'Bank Transfer'), ('Transfers', 'Wallet Transfer'), ('Transfers', 'Other'),
  ('Other', 'Miscellaneous')
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
