-- 1. Create profiles table
create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Default',
  created_at timestamptz not null default now()
);

-- RLS
alter table public.user_profiles enable row level security;
drop policy if exists "Users manage own profiles" on public.user_profiles;
create policy "Users manage own profiles" on public.user_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Add profile_id to modules
alter table public.modules
  add column if not exists profile_id uuid references public.user_profiles(id) on delete cascade;

-- 3. Add active_profile_id to users
alter table public.users
  add column if not exists active_profile_id uuid references public.user_profiles(id) on delete set null;

-- 4. Migrate existing data
-- Create a Default profile for every user who has modules
insert into public.user_profiles (id, user_id, name)
select gen_random_uuid(), user_id, 'Default'
from (select distinct user_id from public.modules) sub;

-- Assign existing modules to their user's Default profile
update public.modules m
set profile_id = up.id
from public.user_profiles up
where m.user_id = up.user_id
  and m.profile_id is null;

-- Set active_profile_id on users who have a profile
update public.users u
set active_profile_id = up.id
from public.user_profiles up
where u.id = up.user_id
  and u.active_profile_id is null;

-- Indexes
create index if not exists idx_modules_profile_id on public.modules(profile_id);
create index if not exists idx_modules_user_profile on public.modules(user_id, profile_id);
create index if not exists idx_user_profiles_user_id on public.user_profiles(user_id);

-- generated_resumes bookkeeping
alter table public.generated_resumes
  add column if not exists profile_id uuid references public.user_profiles(id) on delete set null;
