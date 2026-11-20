-- ATS import for ModuleHire for Business: file exports (Greenhouse, Lever, Ashby, Workable, ADP,
-- any spreadsheet) and a direct Greenhouse Harvest v3 connection.

-- Applicants remember where they came from so a re-import skips people already scored.
-- Written by the server with the service role only (no column grants to authenticated).
alter table public.applicants add column if not exists external_source text;
alter table public.applicants add column if not exists external_id text;
alter table public.applicants add column if not exists ats_stage text;
alter table public.applicants add column if not exists ats_note_posted_at timestamptz;

alter table public.applicants drop constraint if exists applicants_source_check;
alter table public.applicants add constraint applicants_source_check
  check (source = any (array['upload', 'csv', 'bulk', 'link', 'email', 'import', 'greenhouse']));

alter table public.applicants drop constraint if exists applicants_external_source_check;
alter table public.applicants add constraint applicants_external_source_check
  check (external_source is null or external_source = any (array['greenhouse', 'lever', 'ashby', 'workable', 'adp', 'other']));

create unique index if not exists applicants_job_external_key
  on public.applicants (job_id, external_source, external_id)
  where external_source is not null and external_id is not null;
create index if not exists applicants_job_email_idx on public.applicants (job_id, lower(email)) where email is not null;

-- A posting can be linked to the ATS job it was imported from.
alter table public.job_postings add column if not exists external_source text;
alter table public.job_postings add column if not exists external_id text;

-- One connection per org per provider. The secret is AES-256-GCM ciphertext
-- (src/lib/business/secret-box.ts). No grants to anon/authenticated at all: routes check the
-- caller's org role, then read and write with the service role, and never return the secret.
create table if not exists public.org_integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('greenhouse')),
  client_id text not null,
  secret_ciphertext text not null,
  writeback_enabled boolean not null default true,
  status text not null default 'connected' check (status in ('connected', 'error')),
  last_error text,
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider)
);
alter table public.org_integrations enable row level security;
revoke all on table public.org_integrations from anon, authenticated;
grant all on table public.org_integrations to service_role;
