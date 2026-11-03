-- Stop signed-in users from resetting their own generation and upload quotas.
--
-- Same bug as public.users (20261028_lock_users_columns.sql): RLS on these tables only checks
-- that the row is the caller's, and anon/authenticated still have Supabase's default table-wide
-- INSERT/UPDATE/DELETE. With the public anon key and their own token (or an MCP client's OAuth
-- token, which carries the same database access) a user could:
--   * generated_resumes: hard-DELETE rows, or UPDATE created_at into last month, to reset the free
--     monthly generation cap (generate-resume counts rows created this month, deleted or not).
--     They could also set is_temp/expires_at and point docx_url/pdf_url at another user's file,
--     which the purge cron then deletes from storage with the service role.
--   * resumes: hard-DELETE their row to reset the free upload limit (upload-resume counts rows).
--   * resume_generation_counts: set count and overage_credits to anything, directly or through
--     increment_overage_credits / increment_resume_count, which run as the caller.
--
-- A column-level REVOKE does nothing while a table-level GRANT exists, so revoke table-wide and
-- grant back only what the app writes with a user's own client. generate-resume now inserts and
-- scores generated_resumes and bumps the monthly count with the service role.
--
-- A new column users should be able to edit needs its own `grant update (col)` below.

-- generated_resumes: users only soft-delete (my-resumes) and set the application status (resumes/[id]).
revoke insert, update, delete on public.generated_resumes from anon, authenticated;
grant update (status, deleted_at) on public.generated_resumes to authenticated;

-- resumes: upload-resume inserts and module bulk-save marks parsed_at with the user's client; nothing
-- in the app hard-deletes a resume, and deleting one is what resets the upload limit.
revoke delete on public.resumes from anon, authenticated;
revoke insert, update on public.resumes from anon;

-- resume_generation_counts: read by the user (usage, generate-resume), written only by the server.
revoke insert, update, delete on public.resume_generation_counts from anon, authenticated;

revoke execute on function public.increment_resume_count(uuid, text) from public, anon, authenticated;
grant execute on function public.increment_resume_count(uuid, text) to service_role;
revoke execute on function public.increment_overage_credits(uuid, text) from public, anon, authenticated;
grant execute on function public.increment_overage_credits(uuid, text) to service_role;
