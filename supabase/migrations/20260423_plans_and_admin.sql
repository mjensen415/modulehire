-- 1. Add 'standard' to plan enum
alter table public.users drop constraint if exists users_plan_check;
alter table public.users
  add constraint users_plan_check check (plan in ('free', 'standard', 'pro'));

-- 2. Add is_admin flag
alter table public.users
  add column if not exists is_admin boolean not null default false;

-- 3. Add stripe columns
alter table public.users
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists plan_period_end timestamptz;

-- 4. Usage tracking
create table if not exists public.usage_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade not null,
  action text not null check (action in ('generate_resume', 'match_job', 'upload_resume')),
  created_at timestamptz not null default now()
);
create index if not exists idx_usage_events_user_month on public.usage_events(user_id, created_at);

-- 5. RLS on usage_events
alter table public.usage_events enable row level security;
drop policy if exists "usage_events_own" on public.usage_events;
create policy "usage_events_own" on public.usage_events
  for all using (auth.uid() = user_id);

-- 6. Admin bypass policies (drop + recreate)
drop policy if exists "users_own_row" on public.users;
create policy "users_own_row" on public.users
  for all using (
    auth.uid() = id
    or (select is_admin from public.users where id = auth.uid())
  );

drop policy if exists "modules_own" on public.modules;
create policy "modules_own" on public.modules
  for all using (
    auth.uid() = user_id
    or (select is_admin from public.users where id = auth.uid())
  );

drop policy if exists "generated_resumes_own" on public.generated_resumes;
create policy "generated_resumes_own" on public.generated_resumes
  for all using (
    auth.uid() = user_id
    or (select is_admin from public.users where id = auth.uid())
  );

drop policy if exists "job_descriptions_own" on public.job_descriptions;
create policy "job_descriptions_own" on public.job_descriptions
  for all using (
    auth.uid() = user_id
    or (select is_admin from public.users where id = auth.uid())
  );
