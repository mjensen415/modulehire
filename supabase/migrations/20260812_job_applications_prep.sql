-- Interview prep storage on job_applications (Pro-only feature).
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS prep_data jsonb,
  ADD COLUMN IF NOT EXISTS prep_generated_at timestamptz;
