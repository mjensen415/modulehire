-- Lever, Ashby and BambooHR direct connections (org_integrations.provider), their applicant
-- sources, and BambooHR as an external_source. Applied 2026-11-20.
alter table public.org_integrations drop constraint if exists org_integrations_provider_check;
alter table public.org_integrations add constraint org_integrations_provider_check check (provider in ('greenhouse', 'workable', 'lever', 'ashby', 'bamboohr'));
alter table public.applicants drop constraint if exists applicants_source_check;
alter table public.applicants add constraint applicants_source_check
  check (source = any (array['upload', 'csv', 'bulk', 'link', 'email', 'import', 'greenhouse', 'workable', 'lever', 'ashby', 'bamboohr']));
alter table public.applicants drop constraint if exists applicants_external_source_check;
alter table public.applicants add constraint applicants_external_source_check
  check (external_source is null or external_source = any (array['greenhouse', 'lever', 'ashby', 'workable', 'adp', 'bamboohr', 'other']));
