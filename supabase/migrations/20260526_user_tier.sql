-- Adds tier system for 1.0 release.
-- 'free'      — default, no paid features
-- 'pro'       — active paid subscription
-- 'beta_pro'  — complimentary pro access granted during private beta;
--               expires at tier_expires_at, after which user falls back to 'free'

ALTER TABLE users ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier_expires_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'users' AND constraint_name = 'users_tier_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_tier_check CHECK (tier IN ('free', 'pro', 'beta_pro'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS users_tier_idx ON users(tier);
