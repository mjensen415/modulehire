-- JD signal: unscreenable filler lines + degree requirement (with waivability) pulled by the
-- analyze-jd basics pass. job_postings gets degree_requirement too so business-side scoring can
-- treat a waivable degree as experience-substitutable instead of a dealbreaker.
alter table public.job_descriptions
  add column if not exists extracted_fluff text[] not null default '{}',
  add column if not exists degree_requirement jsonb;  -- { mentioned, level, waivable, quote }

alter table public.job_postings
  add column if not exists degree_requirement jsonb;
