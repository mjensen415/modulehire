ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_credits INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_resume_credits(p_user_id uuid, p_amount integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users SET resume_credits = resume_credits + p_amount WHERE id = p_user_id;
END;
$$;
