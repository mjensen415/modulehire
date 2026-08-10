-- Harden increment_resume_credits against search_path hijacking.
-- Supabase security advisor: function_search_path_mutable (WARN).
-- Applied to prod 2026-07-07 via MCP; committed here for schema-as-source-of-truth.
ALTER FUNCTION public.increment_resume_credits(uuid, integer)
  SET search_path = public, pg_temp;
