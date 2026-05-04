-- Explicit job title field on job_descriptions. Distinct from
-- extracted_role_type (a category slug like 'vp-community'); this stores the
-- literal title as written in the JD ("Head of People") and is what gets used
-- as the saved resume's record name.
alter table public.job_descriptions add column if not exists extracted_job_title text;
