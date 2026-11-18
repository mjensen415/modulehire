-- Interviews: rounds per tracked job, a prep page per round, and graded practice answers.
create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  job_application_id uuid references public.job_applications(id) on delete cascade,
  round_name text not null,            -- "Phone screen", "Panel"
  scheduled_at timestamptz,
  format text,                         -- phone, video, onsite
  interviewers jsonb not null default '[]',  -- [{name, title}]
  notes text,
  source_document_id uuid references public.documents(id) on delete set null,
  prep_opened_at timestamptz,          -- first visit to the prep page (Today's three stops nagging)
  practice_questions jsonb,            -- cached 8-12 questions for this round: [{question, why}]
  created_at timestamptz not null default now()
);
create index if not exists interviews_user_scheduled on public.interviews(user_id, scheduled_at);

create table if not exists public.practice_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  interview_id uuid references public.interviews(id) on delete set null, -- kept when a round is deleted (they count toward limits)
  question text not null,
  answer text not null,
  feedback jsonb,                      -- { scores: {structure, specificity, relevance, length}, strongest_part, one_fix, suggested_story: {module_id, why}, tighter_version }
  created_at timestamptz not null default now()
);
create index if not exists practice_answers_user_created on public.practice_answers(user_id, created_at);
create index if not exists practice_answers_interview on public.practice_answers(interview_id, created_at);

alter table public.interviews enable row level security;
alter table public.practice_answers enable row level security;
drop policy if exists interviews_own on public.interviews;
create policy interviews_own on public.interviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists practice_answers_own on public.practice_answers;
create policy practice_answers_own on public.practice_answers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Practice answers are graded and written by the server (they count toward the practice limits),
-- so users only read them. Interviews are the user's own to edit, except the cached questions.
revoke insert, update, delete on public.practice_answers from anon, authenticated;
revoke all on public.interviews, public.practice_answers from anon;
-- (A column REVOKE does nothing under a table-wide GRANT, so revoke table-wide and grant back.)
revoke update on public.interviews from authenticated;
grant update (job_application_id, round_name, scheduled_at, format, interviewers, notes, prep_opened_at) on public.interviews to authenticated;
revoke truncate, references, trigger on public.interviews, public.practice_answers from authenticated;
