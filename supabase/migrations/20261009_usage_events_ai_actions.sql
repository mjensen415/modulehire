-- Allow AI cost-log rows with an "ai_" prefix (Haiku-first logging). Without this the
-- CHECK constraint silently rejects them.
alter table public.usage_events drop constraint if exists usage_events_action_check;
alter table public.usage_events add constraint usage_events_action_check check (
  action = any (array['generate_resume','match_job','upload_resume','analyze_jd','parse_modules','match_job_pass2','match_report'])
  or action ~ '^rl_'
  or action ~ '^ai_'
);
