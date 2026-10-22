-- Allow product-measurement rows with an "ev_" prefix (generate v2: ev_draft_created,
-- ev_export, ev_export_text, ev_library_add, ev_rail_tab). Without this the CHECK constraint
-- silently rejects them, like it did the ai_ rows before 20261009.
alter table public.usage_events drop constraint if exists usage_events_action_check;
alter table public.usage_events add constraint usage_events_action_check check (
  action = any (array['generate_resume','match_job','upload_resume','analyze_jd','parse_modules','match_job_pass2','match_report'])
  or action ~ '^rl_'
  or action ~ '^ai_'
  or action ~ '^ev_'
);
