ALTER TABLE public.modules
  ADD COLUMN IF NOT EXISTS dimensions text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.job_descriptions
  ADD COLUMN IF NOT EXISTS extracted_criteria jsonb,   -- [{label, dimension, weight 1-5, description}]
  ADD COLUMN IF NOT EXISTS match_report jsonb,         -- cached report, see Part C
  ADD COLUMN IF NOT EXISTS match_report_at timestamptz,
  ADD COLUMN IF NOT EXISTS match_report_profile_id uuid;
