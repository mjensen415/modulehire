-- Persist Stripe customer ID per user so the billing portal and
-- subscription state can be looked up without a separate lookup table.
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer_id_idx
  ON users(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
