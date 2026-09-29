ALTER TABLE public.usage_events DROP CONSTRAINT IF EXISTS usage_events_action_check;

ALTER TABLE public.usage_events ADD CONSTRAINT usage_events_action_check
  CHECK (
    action = ANY (ARRAY[
      'generate_resume'::text, 'match_job'::text, 'upload_resume'::text,
      'analyze_jd'::text, 'parse_modules'::text, 'match_job_pass2'::text, 'match_report'::text
    ])
    OR action ~ '^rl_'::text
  );
