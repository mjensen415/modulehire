CREATE TABLE IF NOT EXISTS public.draft_generations (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  step                 text,
  jd_id                uuid,
  jd_text              text,
  selected_module_ids  text[] NOT NULL DEFAULT '{}',
  confirmed_themes     text[] NOT NULL DEFAULT '{}',
  confirmed_phrases    text[] NOT NULL DEFAULT '{}',
  alignment_states     jsonb NOT NULL DEFAULT '{}'::jsonb,
  resume_format        text,
  job_level            text,
  pos_variant          text,
  include_summary      boolean NOT NULL DEFAULT true,
  summary_override     text,
  include_cover_letter boolean NOT NULL DEFAULT false,
  cover_letter_tone    text,
  cover_letter_notes   text,
  include_skills       boolean NOT NULL DEFAULT true,
  skills               text[] NOT NULL DEFAULT '{}',
  include_education    boolean NOT NULL DEFAULT false,
  education            jsonb NOT NULL DEFAULT '[]'::jsonb,
  include_awards       boolean NOT NULL DEFAULT false,
  awards_text          text,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.draft_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "draft_generations_own" ON public.draft_generations;
CREATE POLICY "draft_generations_own" ON public.draft_generations
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
