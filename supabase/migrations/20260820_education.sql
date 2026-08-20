create table if not exists public.education (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school text,
  degree text,
  field text,
  year text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.education enable row level security;

drop policy if exists "Users manage own education" on public.education;
create policy "Users manage own education" on public.education
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_education_user_id on public.education(user_id);
