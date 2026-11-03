-- Defense in depth: anon/authenticated don't need TRUNCATE, REFERENCES or TRIGGER on any public table.
--
-- authenticated holds TRUNCATE on every public table from Supabase's default grants, and TRUNCATE
-- ignores RLS. PostgREST can't issue a TRUNCATE, so this isn't reachable today, but one
-- security-invoker function that truncates would make it so. Tables created later get the default
-- grants again; rerun this after adding one.

do $$
declare t record;
begin
  for t in select c.oid::regclass as rel from pg_class c
           where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  loop
    execute format('revoke truncate, references, trigger on %s from anon, authenticated', t.rel);
  end loop;
end $$;
