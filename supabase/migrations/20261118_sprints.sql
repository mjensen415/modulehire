-- Sprints: one-time 30/90-day passes that never auto-renew. users.sprint_ends_at is the
-- entitlement; sprint_purchases is the ledger (idempotent on the Checkout session id).
alter table public.users add column if not exists sprint_ends_at timestamptz;
-- Not in the users column grants (20261028_lock_users_columns.sql): only the service role writes it.

create table if not exists public.sprint_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  sku text not null check (sku in ('sprint_30','sprint_90')),
  stripe_session_id text unique not null,
  amount_cents integer not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.sprint_purchases enable row level security;
drop policy if exists sprint_purchases_read_own on public.sprint_purchases;
create policy sprint_purchases_read_own on public.sprint_purchases for select using (auth.uid() = user_id);
revoke insert, update, delete, truncate, references, trigger on public.sprint_purchases from anon, authenticated;
create index if not exists sprint_purchases_user on public.sprint_purchases(user_id, ends_at desc);

-- Apply one paid Checkout session: record it and extend the Sprint from whichever is later, now or
-- the current end date. Idempotent: a replayed webhook for the same session changes nothing.
-- Returns the user's sprint_ends_at after the call.
create or replace function public.apply_sprint_purchase(
  p_user_id uuid, p_sku text, p_session_id text, p_amount_cents integer
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_days integer := case p_sku when 'sprint_30' then 30 when 'sprint_90' then 90 end;
  v_start timestamptz;
  v_end timestamptz;
begin
  if v_days is null then raise exception 'unknown sku %', p_sku; end if;
  -- Lock the user row so two sessions completing at once both extend.
  select greatest(now(), coalesce(sprint_ends_at, now())) into v_start from users where id = p_user_id for update;
  if not found then raise exception 'user % not found', p_user_id; end if;
  v_end := v_start + make_interval(days => v_days);
  insert into sprint_purchases (user_id, sku, stripe_session_id, amount_cents, starts_at, ends_at)
    values (p_user_id, p_sku, p_session_id, p_amount_cents, v_start, v_end)
    on conflict (stripe_session_id) do nothing;
  if found then
    update users set sprint_ends_at = v_end where id = p_user_id;
  end if;
  return (select sprint_ends_at from users where id = p_user_id);
end $$;
revoke all on function public.apply_sprint_purchase(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.apply_sprint_purchase(uuid, text, text, integer) to service_role;

-- Reminder emails are logged as usage_events 'ev_sprint_reminder' (ev_ prefix already allowed).
