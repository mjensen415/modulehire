-- Workable direct connection. For Workable, org_integrations.client_id holds the account
-- subdomain and secret_ciphertext the API access token; config.member_id is the Workable member
-- that score comments are posted as (found by the connecting user's email, else an admin).
alter table public.org_integrations drop constraint if exists org_integrations_provider_check;
alter table public.org_integrations add constraint org_integrations_provider_check check (provider in ('greenhouse', 'workable'));
alter table public.org_integrations add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.applicants drop constraint if exists applicants_source_check;
alter table public.applicants add constraint applicants_source_check
  check (source = any (array['upload', 'csv', 'bulk', 'link', 'email', 'import', 'greenhouse', 'workable']));
