-- Lock down public.users so a signed-in user can only change their own profile fields.
--
-- The users_own_row RLS policy only checks which row is touched, and anon/authenticated had
-- table-wide INSERT and UPDATE (Supabase's default grants). Anyone with an account could
-- PATCH /rest/v1/users with the public anon key and their own token and set tier, plan,
-- is_admin, resume_credits or stripe_customer_id on their own row. OAuth tokens issued to MCP
-- clients carry the same access, since Supabase scopes don't limit database access.
--
-- A column-level REVOKE does nothing while a table-level GRANT exists, so revoke table-wide and
-- grant UPDATE back only on the columns the app writes with a user's own client. Everything else
-- (tier, plan, is_admin, credits, Stripe ids, onboarding_complete, email) is written with the
-- service role: Stripe webhook, admin routes, checkout, onboarding, resume contact sync.
-- Rows are created by handle_new_user() (security definer), so users never need INSERT.
--
-- A new column users should be able to edit needs its own `grant update (col)` below.

revoke insert, update on public.users from anon, authenticated;

grant update (
  name,
  phone,
  linkedin_url,
  location,
  summary,
  preferences,
  active_profile_id,
  skills_onboarded_at
) on public.users to authenticated;

-- increment_resume_credits runs as the caller and was executable by anyone, so a user could add
-- credits to their own row. Only the server calls it (generate-resume, Stripe webhook), with the
-- service role.
revoke execute on function public.increment_resume_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_resume_credits(uuid, integer) to service_role;
