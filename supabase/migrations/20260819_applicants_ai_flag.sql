alter table public.applicants
  add column if not exists ai_check_result jsonb,
  add column if not exists ai_checked_at timestamptz;
