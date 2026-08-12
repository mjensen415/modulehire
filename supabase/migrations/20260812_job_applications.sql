-- Job Application Tracker (consumer side) — independent of generated_resumes/
-- the existing /applications resume-status tracker. Lives at /job-tracker.

create table if not exists public.job_applications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  company      text not null,
  title        text not null,
  url          text,
  jd_text      text,
  status       text not null default 'saved'
                 check (status in ('saved', 'applied', 'screening', 'interviewing', 'offered', 'rejected', 'withdrawn')),
  notes        text,
  applied_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists job_applications_user_id_idx on public.job_applications(user_id);

alter table public.job_applications enable row level security;

create policy "job_applications_own"
  on public.job_applications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_job_applications_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger job_applications_updated_at
  before update on public.job_applications
  for each row execute function public.set_job_applications_updated_at();
