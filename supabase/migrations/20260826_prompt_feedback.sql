CREATE TABLE IF NOT EXISTS public.prompt_feedback (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lab_type     text NOT NULL CHECK (lab_type IN ('jd_parse', 'match_modules', 'module_rewrite')),
  input_snapshot  jsonb NOT NULL,
  output_snapshot jsonb NOT NULL,
  feedback     jsonb NOT NULL DEFAULT '{}',
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prompt_feedback_admin_all" ON public.prompt_feedback;
CREATE POLICY "prompt_feedback_admin_all" ON public.prompt_feedback
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.is_admin = true));
