create table if not exists public.interview_prep_cache (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  job_description_id uuid not null references public.job_descriptions(id) on delete cascade,
  prep_data         jsonb not null,
  generated_at      timestamptz not null default now(),
  unique (user_id, job_description_id)
);

create index if not exists interview_prep_cache_user_id_idx on public.interview_prep_cache(user_id);

alter table public.interview_prep_cache enable row level security;

create policy "interview_prep_cache_own"
  on public.interview_prep_cache for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
