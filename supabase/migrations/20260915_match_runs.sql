CREATE TABLE IF NOT EXISTS public.match_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jd_id              uuid NOT NULL REFERENCES public.job_descriptions(id) ON DELETE CASCADE,
  ranked_modules     jsonb NOT NULL,
  recommended_stack  text[] NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS match_runs_user_jd_idx ON public.match_runs (user_id, jd_id, created_at DESC);

ALTER TABLE public.match_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "match_runs_own" ON public.match_runs;
CREATE POLICY "match_runs_own" ON public.match_runs
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
