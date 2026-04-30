-- Track when a beta code has been sent in an invite email (distinct from used_at which is set on signup)
ALTER TABLE public.beta_codes
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to_email text;
