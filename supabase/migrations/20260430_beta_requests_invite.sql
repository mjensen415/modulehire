-- Add invite tracking columns to beta_requests
ALTER TABLE public.beta_requests
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS beta_code text,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz;
