-- Business applicants: stop org members pointing file_url at someone else's file, and stop anyone
-- writing status history for an applicant outside their org.
--
-- 1. applicants.file_url. GET /api/business/applicants/[id] signs file_url with the service role
--    (storage.from('applicant-resumes')). Org members had table-wide INSERT/UPDATE on applicants, so
--    one could set file_url to another org's path ({org_id}/{job_id}/{applicant_id}.ext) and get a
--    signed link to that file. upload/route.ts now writes file_url with the service role, and users
--    keep only the columns the app writes with their client. org_id/job_id stay fixed after insert.
--    Nothing in the app hard-deletes an applicant, so DELETE goes too.
--
-- 2. applicant_status_history. The insert policy only checked user_id = auth.uid(), never the
--    applicant's org, so any signed-in user could add history rows to any org's applicant by id.
--    The status route inserts after checking the caller's org role, which the new check repeats.

revoke insert, update, delete on public.applicants from anon, authenticated;
grant insert (org_id, job_id, name, email, raw_text, source, status) on public.applicants to authenticated;
grant update (
  name,
  status,
  parsed_headline,
  overall_score,
  has_dealbreaker,
  scored_at,
  ai_check_result,
  ai_checked_at
) on public.applicants to authenticated;

drop policy if exists "Status history insert by org members" on public.applicant_status_history;
create policy "Status history insert by org members" on public.applicant_status_history
  for insert with check (
    auth.uid() = user_id
    and (biz_user_owns_org(biz_applicant_org_id(applicant_id)) or biz_user_is_org_member(biz_applicant_org_id(applicant_id)))
  );
