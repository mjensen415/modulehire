-- "Today's three" on the home page: a check marks a step done for that day only.
create table if not exists public.home_step_dismissals (
  user_id uuid not null references public.users(id) on delete cascade,
  step_key text not null,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, step_key, day)
);
alter table public.home_step_dismissals enable row level security;
drop policy if exists home_step_dismissals_own on public.home_step_dismissals;
create policy home_step_dismissals_own on public.home_step_dismissals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke update on public.home_step_dismissals from anon, authenticated;
revoke all on public.home_step_dismissals from anon;
revoke truncate, references, trigger on public.home_step_dismissals from authenticated;
