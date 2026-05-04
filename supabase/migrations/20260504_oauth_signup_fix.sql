-- Harden handle_new_user so OAuth (Google / LinkedIn) signups never fail with
-- "Database error saving new user" when:
--  * a public.users row with the same email already exists (email unique constraint)
--  * a public.users row with the same id already exists (re-runs)
--  * any other unexpected error happens inside the trigger
--
-- Failure inside this AFTER INSERT trigger aborts the auth.users insert and
-- Supabase surfaces the generic "Database error saving new user" message.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.users (id, email, name)
    values (
      new.id,
      new.email,
      coalesce(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        split_part(coalesce(new.email, ''), '@', 1)
      )
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    -- email already exists on a different public.users row (e.g. user originally
    -- signed up with email/password and is now signing in with Google).
    -- Don't block auth signup; the existing public.users row stays as-is and
    -- Supabase identity linking (if enabled in Auth settings) will associate
    -- the new identity with the existing user.
    null;
  when others then
    -- Never let a profile-row hiccup take down auth signup.
    null;
  end;
  return new;
end;
$$;
