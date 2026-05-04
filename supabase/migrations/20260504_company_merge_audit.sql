-- Audit existing job_experiences and modules whose company field looks merged.
-- Read-only — review the output before deciding how to clean up.

-- =========================================================================
-- 1) job_experiences with comma / slash / "and" / "&" in the company name
-- =========================================================================
select id, user_id, company, title, start_date, end_date, created_at
from public.job_experiences
where company ~* ',|/| and | & '
order by created_at desc;

-- =========================================================================
-- 2) modules with the same patterns in source_company (rare after the parser
--    fix lands; useful for back-finding affected uploads)
-- =========================================================================
select id, user_id, title, source_company, source_role_title, created_at
from public.modules
where source_company ~* ',|/| and | & '
  and deleted_at is null
order by created_at desc;

-- =========================================================================
-- 3) module_job_assignments for merged jobs — these rows will need to be
--    re-pointed when the merged job_experience is split into individual rows.
-- =========================================================================
select mja.module_id, mja.job_id, je.company, je.title
from public.module_job_assignments mja
join public.job_experiences je on je.id = mja.job_id
where je.company ~* ',|/| and | & '
order by je.company;

-- Cleanup is intentionally NOT included here. Splitting a merged
-- job_experience into N rows requires a per-user judgment call (which module
-- belongs to which company), so handle case-by-case in the dashboard or via a
-- one-off script after reviewing the rows above.
