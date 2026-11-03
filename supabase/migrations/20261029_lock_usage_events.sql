-- Stop signed-in users from deleting or backdating their own usage_events rows.
--
-- checkAndLog() in src/lib/rate-limit.ts rate-limits every AI endpoint by counting this user's
-- `rl_*` rows in usage_events over the last window. The "own" RLS policy only checks the row, and
-- anon/authenticated had table-wide UPDATE and DELETE, so a user could DELETE their rl_* rows (or
-- move created_at back) through the REST API and call AI routes without limit. The same rows back
-- cost-per-action logging and the ev_ product events, so they could also be rewritten.
--
-- The app only ever inserts with a user's client (rate-limit.ts, events, generate-resume,
-- match-modules, parse-resume, bulk-save, jobs/start, resume-docs download) and never sets id or
-- created_at, so grant INSERT back on just the columns it writes. Reads stay as they are.

revoke insert, update, delete on public.usage_events from anon, authenticated;
grant insert (user_id, action, metadata) on public.usage_events to authenticated;
