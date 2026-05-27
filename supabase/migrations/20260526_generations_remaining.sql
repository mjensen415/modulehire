-- Per-user balance of one-time generation credits purchased via Stripe
-- (Single $9, 5-pack $29). Decremented elsewhere as the user generates.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS generations_remaining integer NOT NULL DEFAULT 0;

-- Atomic increment used by the Stripe webhook on one-time purchase completion.
CREATE OR REPLACE FUNCTION increment_generations_remaining(p_user_id uuid, p_amount integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users
    SET generations_remaining = generations_remaining + p_amount
    WHERE id = p_user_id;
END;
$$;
