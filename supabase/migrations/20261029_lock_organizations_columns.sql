-- Stop org owners from setting their own organization's tier or Stripe customer id.
--
-- "Org owners manage their org" lets the owner do anything to their row, and anon/authenticated had
-- table-wide INSERT/UPDATE. An owner (or anyone, by creating an org) could set tier = 'enterprise',
-- which skips checkOrgDailyScoreCap()'s 500 AI-scored applicants per day, or set
-- stripe_customer_id. OAuth tokens issued to MCP clients carry the same access.
--
-- The app creates orgs with (name, slug, owner_id) and owners rename them, both with the user's
-- client (api/business/organizations). tier and stripe_customer_id are set by the service role only.
-- Owners can still delete their own org; nothing else changes.
--
-- A new column owners should be able to edit needs its own `grant update (col)` below.

revoke insert, update on public.organizations from anon, authenticated;
grant insert (name, slug, owner_id) on public.organizations to authenticated;
grant update (name) on public.organizations to authenticated;
