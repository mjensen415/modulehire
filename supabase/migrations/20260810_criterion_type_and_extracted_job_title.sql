-- Add extracted_job_title to job_postings
-- (AI extraction already uses this field; column was missing from initial schema)
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS extracted_job_title text;

-- Add criterion_type and min_years to scoring_criteria
-- criterion_type: 'skill' (default) | 'experience'
-- min_years: minimum years of experience required (only relevant when criterion_type = 'experience')
ALTER TABLE scoring_criteria
  ADD COLUMN IF NOT EXISTS criterion_type text NOT NULL DEFAULT 'skill',
  ADD COLUMN IF NOT EXISTS min_years integer;
