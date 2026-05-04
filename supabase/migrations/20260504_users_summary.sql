-- Add a saved summary/objective field to users. Populated automatically on
-- resume parse (not as a module) and editable on the My Info page.
alter table public.users add column if not exists summary text;
