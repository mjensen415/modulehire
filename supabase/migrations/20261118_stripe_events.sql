-- Stripe webhook idempotency (ACTION-PLAN P2.1). The webhook inserts the event id
-- before processing; a duplicate delivery hits the primary key and is skipped. If
-- processing fails, the webhook deletes the row and returns 500 so Stripe retries.
-- Service role only: RLS on with no policies, and no grants to anon/authenticated.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;

revoke all on public.stripe_events from anon, authenticated;
