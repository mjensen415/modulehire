-- Voice mock interviews (Pro). One row per session with an ElevenLabs agent.
-- Users read their own rows and can delete them (delete is the privacy control, and the
-- monthly cap counts ev_voice_session_start usage events, which users cannot delete).
-- Every write happens on the server with the service role.
create table if not exists public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  job_description_id uuid references public.job_descriptions(id) on delete set null,
  el_conversation_id text,
  interview_type text not null check (interview_type in ('recruiter_screen', 'behavioral', 'deep_dive')),
  length_minutes integer not null check (length_minutes in (10, 20)),
  status text not null default 'created' check (status in ('created', 'live', 'ended', 'scored', 'failed')),
  consent_version text not null,
  consented_at timestamptz not null,
  duration_s integer,
  transcript jsonb,
  feedback jsonb,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists interview_sessions_user_created_idx
  on public.interview_sessions (user_id, created_at desc);

alter table public.interview_sessions enable row level security;

drop policy if exists interview_sessions_select_own on public.interview_sessions;
create policy interview_sessions_select_own on public.interview_sessions
  for select using (auth.uid() = user_id);

drop policy if exists interview_sessions_delete_own on public.interview_sessions;
create policy interview_sessions_delete_own on public.interview_sessions
  for delete using (auth.uid() = user_id);

-- Same lockdown as 20261029: no client writes, no truncate.
revoke insert, update, truncate, references, trigger on public.interview_sessions from anon, authenticated;
revoke delete on public.interview_sessions from anon;
