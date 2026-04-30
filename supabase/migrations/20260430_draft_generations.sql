-- Draft generation state: one active draft per user.
-- Stores everything needed to restore the generate flow mid-session.

CREATE TABLE IF NOT EXISTS public.draft_generations (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  jd_id          uuid REFERENCES public.job_descriptions(id) ON DELETE SET NULL,
  step           text NOT NULL DEFAULT 'input',
  jd_text        text,
  selected_module_ids  text[]  DEFAULT '{}',
  confirmed_themes     text[]  DEFAULT '{}',
  confirmed_phrases    text[]  DEFAULT '{}',
  alignment_states     jsonb   DEFAULT '{}',
  resume_format        text    DEFAULT 'classic',
  job_level            text    DEFAULT '',
  pos_variant          text    DEFAULT 'A',
  include_summary      boolean DEFAULT true,
  summary_override     text    DEFAULT '',
  include_cover_letter boolean DEFAULT false,
  cover_letter_tone    text    DEFAULT 'professional',
  cover_letter_notes   text    DEFAULT '',
  include_skills       boolean DEFAULT true,
  skills               text[]  DEFAULT '{}',
  include_education    boolean DEFAULT true,
  education            jsonb   DEFAULT '[]',
  updated_at           timestamptz DEFAULT now()
);

-- Only one draft per user at a time
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'draft_generations_user_id_key'
  ) THEN
    ALTER TABLE public.draft_generations ADD CONSTRAINT draft_generations_user_id_key UNIQUE (user_id);
  END IF;
END $$;

ALTER TABLE public.draft_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "draft_own" ON public.draft_generations;
CREATE POLICY "draft_own" ON public.draft_generations
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
