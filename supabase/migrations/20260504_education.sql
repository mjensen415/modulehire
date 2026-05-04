-- Education entries on the user profile. Auto-populated on first resume
-- upload (parser extracts), editable on the My Info page, and pulled into the
-- generate flow as a default that the user can override per-resume.

create table if not exists public.education (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  school text not null default '',
  degree text not null default '',
  field text not null default '',
  year text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_education_user_id on public.education(user_id);

alter table public.education enable row level security;

drop policy if exists education_own_select on public.education;
drop policy if exists education_own_insert on public.education;
drop policy if exists education_own_update on public.education;
drop policy if exists education_own_delete on public.education;

create policy education_own_select on public.education for select using (auth.uid() = user_id);
create policy education_own_insert on public.education for insert with check (auth.uid() = user_id);
create policy education_own_update on public.education for update using (auth.uid() = user_id);
create policy education_own_delete on public.education for delete using (auth.uid() = user_id);

drop trigger if exists education_updated_at on public.education;
create trigger education_updated_at before update on public.education
  for each row execute function public.set_updated_at();
