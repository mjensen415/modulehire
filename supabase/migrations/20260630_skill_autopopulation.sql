-- Skill auto-population for the resume library.
-- Lets parsed/onboarded skills be distinguished from user-entered ones, and
-- supports idempotent upserts so re-parsing never clobbers user-confirmed skills.
--
-- NOTE on naming: the spec referred to job_skills.skill / job_experience_id, but
-- the live table uses job_skills.name / job_skills.job_id. This migration follows
-- the real schema (name + job_id).

-- 1. Provenance of a skill: 'user' (manually added) vs 'parsed' (AI-extracted).
ALTER TABLE public.job_skills
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'user';

-- 2. When the user's skills were first auto-populated (for onboarding gating).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS skills_onboarded_at TIMESTAMPTZ;

-- 3. Coarse skill bucket. NULL allowed (e.g. legacy/user skills with no category).
ALTER TABLE public.job_skills
  ADD COLUMN IF NOT EXISTS category VARCHAR(30);

-- Value guards (added separately so re-running is safe).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_skills_source_check'
  ) THEN
    ALTER TABLE public.job_skills
      ADD CONSTRAINT job_skills_source_check CHECK (source IN ('user', 'parsed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_skills_category_check'
  ) THEN
    ALTER TABLE public.job_skills
      ADD CONSTRAINT job_skills_category_check
        CHECK (category IS NULL OR category IN ('technical', 'domain', 'leadership'));
  END IF;

  -- Unique (job_id, name) is required for the ON CONFLICT DO NOTHING upserts that
  -- keep parsed skills from overwriting user-confirmed ones. No existing dupes
  -- (verified before this migration), so adding it is safe.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_skills_job_id_name_key'
  ) THEN
    ALTER TABLE public.job_skills
      ADD CONSTRAINT job_skills_job_id_name_key UNIQUE (job_id, name);
  END IF;
END$$;
