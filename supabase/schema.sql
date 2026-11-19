-- ModuleHire: production `public` schema, plus the auth trigger, storage buckets and storage
-- policies the app depends on.
--
-- Generated from production (project ymrbpdhmtqimsvkowbco) on 2026-11-18 and checked to match:
-- a scratch `supabase db reset` with only this file applied dumps to the same `public` schema as
-- prod (ordering aside), with the same anon/authenticated table, column and function privileges.
--
-- To regenerate (read-only against prod):
--   supabase link --project-ref ymrbpdhmtqimsvkowbco
--   supabase db dump --linked --schema public -f /tmp/prod-public.sql
-- then replace the "public schema" section below with the dump, dropping the \restrict /
-- \unrestrict lines and the CREATE SCHEMA / ALTER SCHEMA / COMMENT ON SCHEMA "public" lines
-- (Supabase creates the schema). Keep the two hand edits to the dump: the REVOKE ALL block right
-- before the GRANTs (see the comment there), and job_skills' two CHECKs written as IN (...), which
-- re-dumps exactly as prod does (the dump's ANY(ARRAY...) form re-dumps differently). Recheck the
-- hand-written sections at the end against
-- `select * from storage.buckets`, `pg_policies where schemaname = 'storage'` and the
-- non-internal triggers on auth.users.
--
-- supabase/migrations/ stays as the change log; the "DB migrations log" in CLAUDE.md explains why
-- each change was made. New tables get Supabase's default grants: rerun
-- 20261029_revoke_truncate.sql (and any column lockdown) after adding one, then regenerate this.

-- Extensions (Supabase installs these in the `extensions` schema).
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;

-- ============================================================================================
-- public schema (pg_dump of production)
-- ============================================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE TYPE "public"."resume_status" AS ENUM (
    'draft',
    'sent',
    'viewed',
    'interview'
);


ALTER TYPE "public"."resume_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_library_repair"("p_user_id" "uuid", "p_plan" "jsonb", "p_applied_by" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_module_ids uuid[];
  v_job_ids uuid[];
  v_before jsonb;
  v_id uuid;
begin
  if jsonb_typeof(p_plan) <> 'array' or jsonb_array_length(p_plan) = 0 then
    raise exception 'empty plan';
  end if;

  select coalesce(array_agg(distinct (op->>'module_id')::uuid), '{}')
    into v_module_ids
    from jsonb_array_elements(p_plan) op
   where op ? 'module_id';
  select coalesce(array_agg(distinct (op->>'job_id')::uuid), '{}')
    into v_job_ids
    from jsonb_array_elements(p_plan) op
   where op ? 'job_id';

  if exists (select 1 from unnest(v_module_ids) mid
              where not exists (select 1 from modules m where m.id = mid and m.user_id = p_user_id)) then
    raise exception 'plan references a module that is not this user''s';
  end if;
  if exists (select 1 from unnest(v_job_ids) jid
              where not exists (select 1 from job_experiences j where j.id = jid and j.user_id = p_user_id)) then
    raise exception 'plan references a job that is not this user''s';
  end if;

  select jsonb_build_object(
    'modules', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'source_company', m.source_company, 'source_role_title', m.source_role_title,
        'type', m.type, 'deleted_at', m.deleted_at))
      from modules m where m.id = any(v_module_ids)), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'start_date', j.start_date, 'end_date', j.end_date))
      from job_experiences j where j.id = any(v_job_ids)), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('module_id', a.module_id, 'job_id', a.job_id))
      from module_job_assignments a
      join jsonb_array_elements(p_plan) op
        on op->>'op' = 'link' and a.module_id = (op->>'module_id')::uuid and a.job_id = (op->>'job_id')::uuid), '[]'::jsonb)
  ) into v_before;

  insert into module_job_assignments (module_id, job_id)
  select (op->>'module_id')::uuid, (op->>'job_id')::uuid
    from jsonb_array_elements(p_plan) op
   where op->>'op' = 'link'
  on conflict do nothing;

  update modules set deleted_at = now()
   where user_id = p_user_id and deleted_at is null
     and id in (select (op->>'module_id')::uuid from jsonb_array_elements(p_plan) op where op->>'op' = 'hide');

  update modules set source_company = null, source_role_title = null, type = 'positioning'
   where user_id = p_user_id
     and id in (select (op->>'module_id')::uuid from jsonb_array_elements(p_plan) op where op->>'op' = 'positioning');

  update job_experiences j
     set start_date = nullif(op->>'start_date', ''), end_date = nullif(op->>'end_date', '')
    from jsonb_array_elements(p_plan) op
   where op->>'op' = 'job_dates' and j.id = (op->>'job_id')::uuid and j.user_id = p_user_id;

  insert into library_repairs (user_id, summary, applied_by)
  values (p_user_id, jsonb_build_object('plan', p_plan, 'before', v_before), p_applied_by)
  returning id into v_id;
  return v_id;
end;
$$;


ALTER FUNCTION "public"."apply_library_repair"("p_user_id" "uuid", "p_plan" "jsonb", "p_applied_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_sprint_purchase"("p_user_id" "uuid", "p_sku" "text", "p_session_id" "text", "p_amount_cents" integer) RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_days integer := case p_sku when 'sprint_30' then 30 when 'sprint_90' then 90 end;
  v_start timestamptz;
  v_end timestamptz;
begin
  if v_days is null then raise exception 'unknown sku %', p_sku; end if;
  select greatest(now(), coalesce(sprint_ends_at, now())) into v_start from users where id = p_user_id for update;
  if not found then raise exception 'user % not found', p_user_id; end if;
  v_end := v_start + make_interval(days => v_days);
  insert into sprint_purchases (user_id, sku, stripe_session_id, amount_cents, starts_at, ends_at)
    values (p_user_id, p_sku, p_session_id, p_amount_cents, v_start, v_end)
    on conflict (stripe_session_id) do nothing;
  if found then
    update users set sprint_ends_at = v_end where id = p_user_id;
  end if;
  return (select sprint_ends_at from users where id = p_user_id);
end $$;


ALTER FUNCTION "public"."apply_sprint_purchase"("p_user_id" "uuid", "p_sku" "text", "p_session_id" "text", "p_amount_cents" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."biz_applicant_org_id"("p_applicant_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select org_id from public.applicants where id = p_applicant_id;
$$;


ALTER FUNCTION "public"."biz_applicant_org_id"("p_applicant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."biz_criteria_org_id"("p_job_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select org_id from public.job_postings where id = p_job_id;
$$;


ALTER FUNCTION "public"."biz_criteria_org_id"("p_job_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."biz_user_is_org_member"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.org_members
    where org_members.org_id = p_org_id
      and org_members.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."biz_user_is_org_member"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."biz_user_owns_org"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.organizations
    where id = p_org_id
      and owner_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."biz_user_owns_org"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
EXCEPTION
  WHEN unique_violation THEN
    -- Email already exists under a different auth user ID (e.g. email signup then Google OAuth).
    -- Log so this is visible in Supabase logs; never block auth.
    RAISE WARNING 'handle_new_user: email % already exists in public.users for new auth user %', new.email, new.id;
    RETURN new;
  WHEN OTHERS THEN
    -- Log unexpected errors; never block auth signup.
    RAISE WARNING 'handle_new_user: unexpected error for auth user %: % (SQLSTATE %)', new.id, SQLERRM, SQLSTATE;
    RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_applicant_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update public.job_postings
  set applicant_count = applicant_count + 1,
      updated_at = now()
  where id = new.job_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."increment_applicant_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_overage_credits"("p_user_id" "uuid", "p_month" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  INSERT INTO resume_generation_counts (user_id, month, count, overage_credits)
  VALUES (p_user_id, p_month, 0, 1)
  ON CONFLICT (user_id, month)
  DO UPDATE SET overage_credits = resume_generation_counts.overage_credits + 1;
$$;


ALTER FUNCTION "public"."increment_overage_credits"("p_user_id" "uuid", "p_month" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_resume_count"("p_user_id" "uuid", "p_month" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  INSERT INTO resume_generation_counts (user_id, month, count, overage_credits)
  VALUES (p_user_id, p_month, 1, 0)
  ON CONFLICT (user_id, month)
  DO UPDATE SET count = resume_generation_counts.count + 1;
$$;


ALTER FUNCTION "public"."increment_resume_count"("p_user_id" "uuid", "p_month" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_resume_credits"("p_user_id" "uuid", "p_amount" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE users SET resume_credits = resume_credits + p_amount WHERE id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."increment_resume_credits"("p_user_id" "uuid", "p_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.users WHERE id = auth.uid()),
    false
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_expired_temp_files"() RETURNS TABLE("docx_path" "text", "pdf_path" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
    UPDATE public.generated_resumes
    SET deleted_at = NOW()
    WHERE is_temp = TRUE
      AND expires_at < NOW()
      AND deleted_at IS NULL
    RETURNING docx_url, pdf_url;
END;
$$;


ALTER FUNCTION "public"."purge_expired_temp_files"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_job_applications_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_job_applications_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."undo_library_repair"("p_repair_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  r library_repairs%rowtype;
begin
  select * into r from library_repairs where id = p_repair_id for update;
  if not found then raise exception 'repair not found'; end if;
  if r.undone_at is not null then raise exception 'repair already undone'; end if;

  delete from module_job_assignments a
   using jsonb_array_elements(r.summary->'plan') op
   where op->>'op' = 'link'
     and a.module_id = (op->>'module_id')::uuid and a.job_id = (op->>'job_id')::uuid
     and not exists (select 1 from jsonb_array_elements(r.summary->'before'->'links') l
                      where (l->>'module_id')::uuid = a.module_id and (l->>'job_id')::uuid = a.job_id);

  update modules m
     set source_company = b->>'source_company',
         source_role_title = b->>'source_role_title',
         type = b->>'type',
         deleted_at = (b->>'deleted_at')::timestamptz
    from jsonb_array_elements(r.summary->'before'->'modules') b
   where m.id = (b->>'id')::uuid and m.user_id = r.user_id;

  update job_experiences j
     set start_date = b->>'start_date', end_date = b->>'end_date'
    from jsonb_array_elements(r.summary->'before'->'jobs') b
   where j.id = (b->>'id')::uuid and j.user_id = r.user_id;

  update library_repairs set undone_at = now() where id = p_repair_id;
end;
$$;


ALTER FUNCTION "public"."undo_library_repair"("p_repair_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."applicant_criterion_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "applicant_id" "uuid" NOT NULL,
    "criterion_id" "uuid" NOT NULL,
    "score" integer,
    "met" boolean,
    "evidence" "text",
    CONSTRAINT "applicant_criterion_scores_score_check" CHECK ((("score" >= 0) AND ("score" <= 100)))
);


ALTER TABLE "public"."applicant_criterion_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."applicant_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "applicant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."applicant_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."applicant_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "applicant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "from_status" "text",
    "to_status" "text",
    "changed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."applicant_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."applicants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "name" "text",
    "email" "text",
    "raw_text" "text",
    "parsed_headline" "text",
    "overall_score" integer,
    "has_dealbreaker" boolean DEFAULT false,
    "status" "text" DEFAULT 'new'::"text",
    "source" "text",
    "file_url" "text",
    "scored_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ai_check_result" "jsonb",
    "ai_checked_at" timestamp with time zone,
    CONSTRAINT "applicants_overall_score_check" CHECK ((("overall_score" >= 0) AND ("overall_score" <= 100))),
    CONSTRAINT "applicants_source_check" CHECK (("source" = ANY (ARRAY['upload'::"text", 'csv'::"text", 'bulk'::"text", 'link'::"text", 'email'::"text"]))),
    CONSTRAINT "applicants_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'reviewing'::"text", 'shortlisted'::"text", 'interviewing'::"text", 'offered'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."applicants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."beta_codes" (
    "code" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "used_by_email" "text",
    "used_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sent_at" timestamp with time zone,
    "sent_to_email" "text"
);


ALTER TABLE "public"."beta_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."beta_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "rating" integer,
    "category" "text",
    "message" "text" NOT NULL,
    "page_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    CONSTRAINT "beta_feedback_category_check" CHECK (("category" = ANY (ARRAY['bug'::"text", 'feature'::"text", 'general'::"text", 'praise'::"text"]))),
    CONSTRAINT "beta_feedback_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "beta_feedback_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'in_progress'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."beta_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."beta_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "context" "text",
    "marketing_opt_in" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "beta_code" "text",
    "invited_at" timestamp with time zone
);


ALTER TABLE "public"."beta_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "filename" "text",
    "file_url" "text",
    "raw_text" "text",
    "job_experience_id" "uuid",
    "period_label" "text",
    "source_resume_id" "uuid",
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "documents_kind_check" CHECK (("kind" = ANY (ARRAY['resume'::"text", 'performance_review'::"text", 'brag_doc'::"text", 'interview_email'::"text", 'generated_resume'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."draft_generations" (
    "user_id" "uuid" NOT NULL,
    "step" "text",
    "jd_id" "uuid",
    "jd_text" "text",
    "selected_module_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "confirmed_themes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "confirmed_phrases" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "alignment_states" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resume_format" "text",
    "job_level" "text",
    "pos_variant" "text",
    "include_summary" boolean DEFAULT true NOT NULL,
    "summary_override" "text",
    "include_cover_letter" boolean DEFAULT false NOT NULL,
    "cover_letter_tone" "text",
    "cover_letter_notes" "text",
    "include_skills" boolean DEFAULT true NOT NULL,
    "skills" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "include_education" boolean DEFAULT false NOT NULL,
    "education" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "include_awards" boolean DEFAULT false NOT NULL,
    "awards_text" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."draft_generations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."education" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "school" "text" DEFAULT ''::"text" NOT NULL,
    "degree" "text" DEFAULT ''::"text" NOT NULL,
    "field" "text" DEFAULT ''::"text" NOT NULL,
    "year" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."education" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_resumes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "job_description_id" "uuid",
    "title" "text" NOT NULL,
    "module_ids_used" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "positioning_variant" "text",
    "company_color_hex" "text" DEFAULT '#00B4B4'::"text",
    "docx_url" "text",
    "pdf_url" "text",
    "is_temp" boolean DEFAULT true NOT NULL,
    "expires_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "public"."resume_status" DEFAULT 'draft'::"public"."resume_status" NOT NULL,
    "ats_score" integer,
    "profile_id" "uuid",
    "generation_flags" "jsonb",
    "unsupported_phrases" "text"[],
    CONSTRAINT "generated_resumes_positioning_variant_check" CHECK (("positioning_variant" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text", 'D'::"text"])))
);


ALTER TABLE "public"."generated_resumes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."home_step_dismissals" (
    "user_id" "uuid" NOT NULL,
    "step_key" "text" NOT NULL,
    "day" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."home_step_dismissals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hr_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_library_requests" (
    "email" "text" NOT NULL,
    "last_sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_count" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."hr_library_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_orders" (
    "stripe_session_id" "text" NOT NULL,
    "email" "text" NOT NULL,
    "customer_name" "text",
    "company" "text",
    "product_slugs" "text"[] NOT NULL,
    "amount_total" integer,
    "currency" "text",
    "call_included" boolean DEFAULT false NOT NULL,
    "call_status" "text",
    "emailed_at" timestamp with time zone,
    "email_error" "text",
    "download_count" integer DEFAULT 0 NOT NULL,
    "last_download_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hr_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_partner_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "organization" "text",
    "website" "text",
    "partner_type" "text",
    "client_count" "text",
    "notes" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "brevo_error" "text",
    CONSTRAINT "hr_partner_applications_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'approved'::"text", 'declined'::"text", 'waitlist'::"text"])))
);


ALTER TABLE "public"."hr_partner_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_products" (
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "price_cents" integer NOT NULL,
    "stripe_product" "text" NOT NULL,
    "stripe_price" "text" NOT NULL,
    "payment_link" "text",
    "files" "text"[] NOT NULL,
    "includes" "text"[] NOT NULL,
    "call_included" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hr_products_type_check" CHECK (("type" = ANY (ARRAY['guide'::"text", 'kit'::"text", 'bundle'::"text"])))
);


ALTER TABLE "public"."hr_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_unsubscribes" (
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "brevo_ok" boolean
);


ALTER TABLE "public"."hr_unsubscribes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_waitlist_signups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "email" "text" NOT NULL,
    "company" "text",
    "source" "text" DEFAULT 'waitlist'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "team_size" "text",
    "brevo_synced_at" timestamp with time zone,
    "brevo_error" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "unsubscribed_at" timestamp with time zone,
    CONSTRAINT "hr_waitlist_signups_source_check" CHECK (("source" = ANY (ARRAY['waitlist'::"text", 'lead_magnet'::"text", 'launch_offer'::"text"]))),
    CONSTRAINT "hr_waitlist_signups_team_size_check" CHECK ((("team_size" IS NULL) OR ("team_size" = ANY (ARRAY['under_15'::"text", '15_49'::"text", '50_plus'::"text"]))))
);


ALTER TABLE "public"."hr_waitlist_signups" OWNER TO "postgres";


COMMENT ON COLUMN "public"."hr_waitlist_signups"."brevo_synced_at" IS 'Set by the hr-signup edge function when the contact was pushed to Brevo';


CREATE TABLE IF NOT EXISTS "public"."interview_prep_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "job_description_id" "uuid" NOT NULL,
    "prep_data" "jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."interview_prep_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interview_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "job_description_id" "uuid",
    "el_conversation_id" "text",
    "interview_type" "text" NOT NULL,
    "length_minutes" integer NOT NULL,
    "status" "text" DEFAULT 'created'::"text" NOT NULL,
    "consent_version" "text" NOT NULL,
    "consented_at" timestamp with time zone NOT NULL,
    "duration_s" integer,
    "transcript" "jsonb",
    "feedback" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    CONSTRAINT "interview_sessions_interview_type_check" CHECK (("interview_type" = ANY (ARRAY['recruiter_screen'::"text", 'behavioral'::"text", 'deep_dive'::"text"]))),
    CONSTRAINT "interview_sessions_length_minutes_check" CHECK (("length_minutes" = ANY (ARRAY[10, 20]))),
    CONSTRAINT "interview_sessions_status_check" CHECK (("status" = ANY (ARRAY['created'::"text", 'live'::"text", 'ended'::"text", 'scored'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."interview_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "job_application_id" "uuid",
    "round_name" "text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "format" "text",
    "interviewers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notes" "text",
    "source_document_id" "uuid",
    "prep_opened_at" timestamp with time zone,
    "practice_questions" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."interviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company" "text" NOT NULL,
    "title" "text" NOT NULL,
    "url" "text",
    "jd_text" "text",
    "status" "text" DEFAULT 'saved'::"text" NOT NULL,
    "notes" "text",
    "applied_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "prep_data" "jsonb",
    "prep_generated_at" timestamp with time zone,
    "job_description_id" "uuid",
    "source" "text",
    "posting_age" "text",
    "first_response_at" "date",
    "response_type" "text",
    CONSTRAINT "job_applications_posting_age_check" CHECK (("posting_age" = ANY (ARRAY['today'::"text", '1_3_days'::"text", '4_7_days'::"text", '1_2_weeks'::"text", '2_plus_weeks'::"text"]))),
    CONSTRAINT "job_applications_response_type_check" CHECK (("response_type" = ANY (ARRAY['auto_reject'::"text", 'human_reject'::"text", 'recruiter_screen'::"text", 'interview'::"text", 'offer'::"text"]))),
    CONSTRAINT "job_applications_source_check" CHECK (("source" = ANY (ARRAY['company_site'::"text", 'linkedin_easy_apply'::"text", 'linkedin_external'::"text", 'job_board'::"text", 'referral'::"text", 'recruiter'::"text", 'other'::"text"]))),
    CONSTRAINT "job_applications_status_check" CHECK (("status" = ANY (ARRAY['saved'::"text", 'applied'::"text", 'screening'::"text", 'interviewing'::"text", 'offered'::"text", 'rejected'::"text", 'withdrawn'::"text", 'no_response'::"text"])))
);


ALTER TABLE "public"."job_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_descriptions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "raw_text" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_url" "text",
    "extracted_company" "text",
    "extracted_role_type" "text",
    "extracted_themes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "extracted_seniority" "text",
    "extracted_phrases" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "extracted_job_title" "text",
    "extracted_criteria" "jsonb",
    "match_report" "jsonb",
    "match_report_at" timestamp with time zone,
    "match_report_profile_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "raw_text_hash" "text",
    "extracted_fluff" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "degree_requirement" "jsonb",
    CONSTRAINT "job_descriptions_source_type_check" CHECK (("source_type" = ANY (ARRAY['paste'::"text", 'upload'::"text", 'url'::"text"])))
);


ALTER TABLE "public"."job_descriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_experiences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company" "text" NOT NULL,
    "title" "text",
    "start_date" "text",
    "end_date" "text",
    "location" "text",
    "employment_type" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."job_experiences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_postings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "raw_jd" "text",
    "extracted_themes" "text"[] DEFAULT '{}'::"text"[],
    "extracted_phrases" "text"[] DEFAULT '{}'::"text"[],
    "extracted_seniority" "text",
    "extracted_role_type" "text",
    "extracted_company" "text",
    "status" "text" DEFAULT 'active'::"text",
    "applicant_count" integer DEFAULT 0,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "extracted_job_title" "text",
    "degree_requirement" "jsonb",
    CONSTRAINT "job_postings_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'paused'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."job_postings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_skills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "source" character varying(20) DEFAULT 'user'::character varying NOT NULL,
    "category" character varying(30),
    CONSTRAINT "job_skills_category_check" CHECK ((("category" IS NULL) OR ("category" IN ('technical', 'domain', 'leadership')))),
    CONSTRAINT "job_skills_source_check" CHECK (("source" IN ('user', 'parsed')))
);


ALTER TABLE "public"."job_skills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."library_repairs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "summary" "jsonb" NOT NULL,
    "applied_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "undone_at" timestamp with time zone
);


ALTER TABLE "public"."library_repairs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "jd_id" "uuid" NOT NULL,
    "ranked_modules" "jsonb" NOT NULL,
    "recommended_stack" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."match_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mcp_link_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "resume_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mcp_link_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."module_job_assignments" (
    "module_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."module_job_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."modules" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source_resume_id" "uuid",
    "type" "text" NOT NULL,
    "weight" "text" DEFAULT 'strong'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "source_company" "text",
    "source_role_title" "text",
    "date_start" "text",
    "date_end" "text",
    "employment_type" "text",
    "role_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "themes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "company_stage" "text"[] DEFAULT '{any}'::"text"[] NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_id" "uuid",
    "pinned" boolean DEFAULT false NOT NULL,
    "dimensions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "source_quote" "text",
    "source_document_id" "uuid",
    CONSTRAINT "modules_employment_type_check" CHECK (("employment_type" = ANY (ARRAY['full-time'::"text", 'consulting'::"text", 'contract'::"text", 'board'::"text", 'volunteer'::"text"]))),
    CONSTRAINT "modules_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'confirmed'::"text", 'rejected'::"text"]))),
    CONSTRAINT "modules_type_check" CHECK (("type" = ANY (ARRAY['experience'::"text", 'skill'::"text", 'story'::"text", 'positioning'::"text"]))),
    CONSTRAINT "modules_weight_check" CHECK (("weight" = ANY (ARRAY['anchor'::"text", 'strong'::"text", 'supporting'::"text"])))
);


ALTER TABLE "public"."modules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "invited_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "org_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'reviewer'::"text"])))
);


ALTER TABLE "public"."org_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    "owner_id" "uuid" NOT NULL,
    "tier" "text" DEFAULT 'starter'::"text",
    "stripe_customer_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "organizations_tier_check" CHECK (("tier" = ANY (ARRAY['starter'::"text", 'growth'::"text", 'enterprise'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."practice_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "interview_id" "uuid",
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "feedback" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."practice_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prompt_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lab_type" "text" NOT NULL,
    "input_snapshot" "jsonb" NOT NULL,
    "output_snapshot" "jsonb" NOT NULL,
    "feedback" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "prompt_feedback_lab_type_check" CHECK (("lab_type" = ANY (ARRAY['jd_parse'::"text", 'match_modules'::"text", 'module_rewrite'::"text"])))
);


ALTER TABLE "public"."prompt_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "action" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resume_document_history" (
    "id" bigint NOT NULL,
    "document_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "doc" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."resume_document_history" OWNER TO "postgres";


ALTER TABLE "public"."resume_document_history" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."resume_document_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


CREATE TABLE IF NOT EXISTS "public"."resume_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "job_description_id" "uuid",
    "generated_resume_id" "uuid",
    "doc" "jsonb" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "fit_report" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."resume_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resume_generation_counts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "month" "text" NOT NULL,
    "count" integer DEFAULT 0 NOT NULL,
    "overage_credits" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."resume_generation_counts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resumes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "filename" "text" NOT NULL,
    "file_url" "text",
    "raw_text" "text" NOT NULL,
    "parsed_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."resumes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scoring_criteria" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "weight" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0,
    "criterion_type" "text" DEFAULT 'skill'::"text" NOT NULL,
    "min_years" integer,
    CONSTRAINT "scoring_criteria_weight_check" CHECK (("weight" = ANY (ARRAY['dealbreaker'::"text", 'must_have'::"text", 'nice_to_have'::"text"])))
);


ALTER TABLE "public"."scoring_criteria" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."skill_module_assignments" (
    "skill_id" "uuid" NOT NULL,
    "module_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."skill_module_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sprint_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sku" "text" NOT NULL,
    "stripe_session_id" "text" NOT NULL,
    "amount_cents" integer NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sprint_purchases_sku_check" CHECK (("sku" = ANY (ARRAY['sprint_30'::"text", 'sprint_90'::"text"])))
);


ALTER TABLE "public"."sprint_purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_events" (
    "id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stripe_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb",
    CONSTRAINT "usage_events_action_check" CHECK ((("action" = ANY (ARRAY['generate_resume'::"text", 'match_job'::"text", 'upload_resume'::"text", 'analyze_jd'::"text", 'parse_modules'::"text", 'match_job_pass2'::"text", 'match_report'::"text"])) OR ("action" ~ '^rl_'::"text") OR ("action" ~ '^ai_'::"text") OR ("action" ~ '^ev_'::"text")))
);


ALTER TABLE "public"."usage_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Default'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "plan" "text" DEFAULT 'free'::"text" NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_admin" boolean DEFAULT false NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "plan_period_end" timestamp with time zone,
    "phone" "text",
    "linkedin_url" "text",
    "location" "text",
    "plan_interval" "text",
    "plan_current_period_end" timestamp with time zone,
    "summary" "text",
    "resume_credits" integer DEFAULT 0 NOT NULL,
    "tier" "text" DEFAULT 'free'::"text" NOT NULL,
    "tier_expires_at" timestamp with time zone,
    "onboarding_complete" boolean DEFAULT false NOT NULL,
    "generations_remaining" integer DEFAULT 0 NOT NULL,
    "skills_onboarded_at" timestamp with time zone,
    "active_profile_id" "uuid",
    "preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sprint_ends_at" timestamp with time zone,
    CONSTRAINT "users_plan_check" CHECK (("plan" = ANY (ARRAY['free'::"text", 'standard'::"text", 'pro'::"text"]))),
    CONSTRAINT "users_plan_interval_check" CHECK (("plan_interval" = ANY (ARRAY['monthly'::"text", 'annual'::"text"]))),
    CONSTRAINT "users_tier_check" CHECK (("tier" = ANY (ARRAY['free'::"text", 'pro'::"text", 'beta_pro'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."applicant_criterion_scores"
    ADD CONSTRAINT "applicant_criterion_scores_applicant_id_criterion_id_key" UNIQUE ("applicant_id", "criterion_id");


ALTER TABLE ONLY "public"."applicant_criterion_scores"
    ADD CONSTRAINT "applicant_criterion_scores_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."applicant_notes"
    ADD CONSTRAINT "applicant_notes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."applicant_status_history"
    ADD CONSTRAINT "applicant_status_history_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."applicants"
    ADD CONSTRAINT "applicants_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."beta_codes"
    ADD CONSTRAINT "beta_codes_pkey" PRIMARY KEY ("code");


ALTER TABLE ONLY "public"."beta_feedback"
    ADD CONSTRAINT "beta_feedback_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."beta_requests"
    ADD CONSTRAINT "beta_requests_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."draft_generations"
    ADD CONSTRAINT "draft_generations_pkey" PRIMARY KEY ("user_id");


ALTER TABLE ONLY "public"."education"
    ADD CONSTRAINT "education_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."generated_resumes"
    ADD CONSTRAINT "generated_resumes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."home_step_dismissals"
    ADD CONSTRAINT "home_step_dismissals_pkey" PRIMARY KEY ("user_id", "step_key", "day");


ALTER TABLE ONLY "public"."hr_config"
    ADD CONSTRAINT "hr_config_pkey" PRIMARY KEY ("key");


ALTER TABLE ONLY "public"."hr_library_requests"
    ADD CONSTRAINT "hr_library_requests_pkey" PRIMARY KEY ("email");


ALTER TABLE ONLY "public"."hr_orders"
    ADD CONSTRAINT "hr_orders_pkey" PRIMARY KEY ("stripe_session_id");


ALTER TABLE ONLY "public"."hr_partner_applications"
    ADD CONSTRAINT "hr_partner_applications_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."hr_products"
    ADD CONSTRAINT "hr_products_pkey" PRIMARY KEY ("slug");


ALTER TABLE ONLY "public"."hr_products"
    ADD CONSTRAINT "hr_products_stripe_price_key" UNIQUE ("stripe_price");


ALTER TABLE ONLY "public"."hr_unsubscribes"
    ADD CONSTRAINT "hr_unsubscribes_pkey" PRIMARY KEY ("email");


ALTER TABLE ONLY "public"."hr_waitlist_signups"
    ADD CONSTRAINT "hr_waitlist_signups_email_source_key" UNIQUE ("email", "source");


ALTER TABLE ONLY "public"."hr_waitlist_signups"
    ADD CONSTRAINT "hr_waitlist_signups_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."interview_prep_cache"
    ADD CONSTRAINT "interview_prep_cache_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."interview_prep_cache"
    ADD CONSTRAINT "interview_prep_cache_user_id_job_description_id_key" UNIQUE ("user_id", "job_description_id");


ALTER TABLE ONLY "public"."interview_sessions"
    ADD CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."interviews"
    ADD CONSTRAINT "interviews_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."job_applications"
    ADD CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."job_descriptions"
    ADD CONSTRAINT "job_descriptions_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."job_experiences"
    ADD CONSTRAINT "job_experiences_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."job_experiences"
    ADD CONSTRAINT "job_experiences_user_company_title_start_key" UNIQUE ("user_id", "company", "title", "start_date");


ALTER TABLE ONLY "public"."job_postings"
    ADD CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."job_skills"
    ADD CONSTRAINT "job_skills_job_id_name_key" UNIQUE ("job_id", "name");


ALTER TABLE ONLY "public"."job_skills"
    ADD CONSTRAINT "job_skills_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."library_repairs"
    ADD CONSTRAINT "library_repairs_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."match_runs"
    ADD CONSTRAINT "match_runs_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."mcp_link_tokens"
    ADD CONSTRAINT "mcp_link_tokens_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."module_job_assignments"
    ADD CONSTRAINT "module_job_assignments_pkey" PRIMARY KEY ("module_id", "job_id");


ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."org_members"
    ADD CONSTRAINT "org_members_org_id_user_id_key" UNIQUE ("org_id", "user_id");


ALTER TABLE ONLY "public"."org_members"
    ADD CONSTRAINT "org_members_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");


ALTER TABLE ONLY "public"."practice_answers"
    ADD CONSTRAINT "practice_answers_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."prompt_feedback"
    ADD CONSTRAINT "prompt_feedback_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."resume_document_history"
    ADD CONSTRAINT "resume_document_history_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."resume_documents"
    ADD CONSTRAINT "resume_documents_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."resume_generation_counts"
    ADD CONSTRAINT "resume_generation_counts_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."resume_generation_counts"
    ADD CONSTRAINT "resume_generation_counts_user_id_month_key" UNIQUE ("user_id", "month");


ALTER TABLE ONLY "public"."resumes"
    ADD CONSTRAINT "resumes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."scoring_criteria"
    ADD CONSTRAINT "scoring_criteria_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."skill_module_assignments"
    ADD CONSTRAINT "skill_module_assignments_pkey" PRIMARY KEY ("skill_id", "module_id");


ALTER TABLE ONLY "public"."sprint_purchases"
    ADD CONSTRAINT "sprint_purchases_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."sprint_purchases"
    ADD CONSTRAINT "sprint_purchases_stripe_session_id_key" UNIQUE ("stripe_session_id");


ALTER TABLE ONLY "public"."stripe_events"
    ADD CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."usage_events"
    ADD CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");


ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_stripe_customer_id_key" UNIQUE ("stripe_customer_id");


ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");


CREATE INDEX "applicants_job_id_idx" ON "public"."applicants" USING "btree" ("job_id");


CREATE INDEX "applicants_score_idx" ON "public"."applicants" USING "btree" ("job_id", "overall_score" DESC);


CREATE INDEX "documents_user_created" ON "public"."documents" USING "btree" ("user_id", "created_at" DESC);


CREATE INDEX "hr_orders_email_idx" ON "public"."hr_orders" USING "btree" ("lower"("email"));


CREATE INDEX "hr_partner_applications_email_idx" ON "public"."hr_partner_applications" USING "btree" ("lower"("email"));


CREATE INDEX "idx_education_user_id" ON "public"."education" USING "btree" ("user_id");


CREATE INDEX "idx_generated_resumes_expires_at" ON "public"."generated_resumes" USING "btree" ("expires_at") WHERE ("is_temp" = true);


CREATE INDEX "idx_generated_resumes_user_id" ON "public"."generated_resumes" USING "btree" ("user_id");


CREATE INDEX "idx_job_descriptions_user_id" ON "public"."job_descriptions" USING "btree" ("user_id");


CREATE INDEX "idx_library_repairs_user" ON "public"."library_repairs" USING "btree" ("user_id", "created_at" DESC);


CREATE UNIQUE INDEX "idx_mcp_link_tokens_hash" ON "public"."mcp_link_tokens" USING "btree" ("token_hash");


CREATE INDEX "idx_mcp_link_tokens_user" ON "public"."mcp_link_tokens" USING "btree" ("user_id", "created_at" DESC);


CREATE INDEX "idx_modules_deleted_at" ON "public"."modules" USING "btree" ("deleted_at");


CREATE INDEX "idx_modules_profile_id" ON "public"."modules" USING "btree" ("profile_id");


CREATE INDEX "idx_modules_role_types" ON "public"."modules" USING "gin" ("role_types");


CREATE INDEX "idx_modules_themes" ON "public"."modules" USING "gin" ("themes");


CREATE INDEX "idx_modules_type" ON "public"."modules" USING "btree" ("type");


CREATE INDEX "idx_modules_user_id" ON "public"."modules" USING "btree" ("user_id");


CREATE INDEX "idx_modules_user_profile" ON "public"."modules" USING "btree" ("user_id", "profile_id");


CREATE INDEX "idx_resume_document_history_doc" ON "public"."resume_document_history" USING "btree" ("document_id", "version" DESC);


CREATE INDEX "idx_resume_documents_generated_resume" ON "public"."resume_documents" USING "btree" ("generated_resume_id");


CREATE INDEX "idx_resumes_deleted_at" ON "public"."resumes" USING "btree" ("deleted_at");


CREATE INDEX "idx_usage_events_user_month" ON "public"."usage_events" USING "btree" ("user_id", "created_at");


CREATE INDEX "idx_user_profiles_user_id" ON "public"."user_profiles" USING "btree" ("user_id");


CREATE INDEX "interview_prep_cache_user_id_idx" ON "public"."interview_prep_cache" USING "btree" ("user_id");


CREATE INDEX "interview_sessions_user_created_idx" ON "public"."interview_sessions" USING "btree" ("user_id", "created_at" DESC);


CREATE INDEX "interviews_user_scheduled" ON "public"."interviews" USING "btree" ("user_id", "scheduled_at");


CREATE INDEX "job_applications_user_id_idx" ON "public"."job_applications" USING "btree" ("user_id");


CREATE INDEX "job_descriptions_user_hash_idx" ON "public"."job_descriptions" USING "btree" ("user_id", "raw_text_hash");


CREATE INDEX "match_runs_user_jd_idx" ON "public"."match_runs" USING "btree" ("user_id", "jd_id", "created_at" DESC);


CREATE INDEX "modules_source_document" ON "public"."modules" USING "btree" ("source_document_id") WHERE ("source_document_id" IS NOT NULL);


CREATE INDEX "modules_user_status" ON "public"."modules" USING "btree" ("user_id", "status") WHERE ("deleted_at" IS NULL);


CREATE INDEX "practice_answers_interview" ON "public"."practice_answers" USING "btree" ("interview_id", "created_at");


CREATE INDEX "practice_answers_user_created" ON "public"."practice_answers" USING "btree" ("user_id", "created_at");


CREATE INDEX "rate_limits_key_action_created_at" ON "public"."rate_limits" USING "btree" ("key", "action", "created_at");


CREATE INDEX "rate_limits_key_action_created_idx" ON "public"."rate_limits" USING "btree" ("key", "action", "created_at");


CREATE INDEX "resume_generation_counts_user_month_idx" ON "public"."resume_generation_counts" USING "btree" ("user_id", "month");


CREATE INDEX "sprint_purchases_user" ON "public"."sprint_purchases" USING "btree" ("user_id", "ends_at" DESC);


CREATE INDEX "users_stripe_customer_id_idx" ON "public"."users" USING "btree" ("stripe_customer_id");


CREATE INDEX "users_stripe_subscription_id_idx" ON "public"."users" USING "btree" ("stripe_subscription_id");


CREATE INDEX "users_tier_idx" ON "public"."users" USING "btree" ("tier");


CREATE OR REPLACE TRIGGER "applicant_inserted" AFTER INSERT ON "public"."applicants" FOR EACH ROW EXECUTE FUNCTION "public"."increment_applicant_count"();


CREATE OR REPLACE TRIGGER "education_updated_at" BEFORE UPDATE ON "public"."education" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


CREATE OR REPLACE TRIGGER "job_applications_updated_at" BEFORE UPDATE ON "public"."job_applications" FOR EACH ROW EXECUTE FUNCTION "public"."set_job_applications_updated_at"();


CREATE OR REPLACE TRIGGER "modules_updated_at" BEFORE UPDATE ON "public"."modules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


CREATE OR REPLACE TRIGGER "users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


ALTER TABLE ONLY "public"."applicant_criterion_scores"
    ADD CONSTRAINT "applicant_criterion_scores_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."applicant_criterion_scores"
    ADD CONSTRAINT "applicant_criterion_scores_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "public"."scoring_criteria"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."applicant_notes"
    ADD CONSTRAINT "applicant_notes_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."applicant_notes"
    ADD CONSTRAINT "applicant_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


ALTER TABLE ONLY "public"."applicant_status_history"
    ADD CONSTRAINT "applicant_status_history_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."applicant_status_history"
    ADD CONSTRAINT "applicant_status_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


ALTER TABLE ONLY "public"."applicants"
    ADD CONSTRAINT "applicants_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."job_postings"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."applicants"
    ADD CONSTRAINT "applicants_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."beta_feedback"
    ADD CONSTRAINT "beta_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_job_experience_id_fkey" FOREIGN KEY ("job_experience_id") REFERENCES "public"."job_experiences"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_source_resume_id_fkey" FOREIGN KEY ("source_resume_id") REFERENCES "public"."resumes"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."draft_generations"
    ADD CONSTRAINT "draft_generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."education"
    ADD CONSTRAINT "education_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."generated_resumes"
    ADD CONSTRAINT "generated_resumes_job_description_id_fkey" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."generated_resumes"
    ADD CONSTRAINT "generated_resumes_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."generated_resumes"
    ADD CONSTRAINT "generated_resumes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."home_step_dismissals"
    ADD CONSTRAINT "home_step_dismissals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."interview_prep_cache"
    ADD CONSTRAINT "interview_prep_cache_job_description_id_fkey" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."interview_prep_cache"
    ADD CONSTRAINT "interview_prep_cache_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."interview_sessions"
    ADD CONSTRAINT "interview_sessions_job_description_id_fkey" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."interview_sessions"
    ADD CONSTRAINT "interview_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."interviews"
    ADD CONSTRAINT "interviews_job_application_id_fkey" FOREIGN KEY ("job_application_id") REFERENCES "public"."job_applications"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."interviews"
    ADD CONSTRAINT "interviews_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."interviews"
    ADD CONSTRAINT "interviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."job_applications"
    ADD CONSTRAINT "job_applications_job_description_id_fkey" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id");


ALTER TABLE ONLY "public"."job_applications"
    ADD CONSTRAINT "job_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."job_descriptions"
    ADD CONSTRAINT "job_descriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."job_experiences"
    ADD CONSTRAINT "job_experiences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."job_postings"
    ADD CONSTRAINT "job_postings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


ALTER TABLE ONLY "public"."job_postings"
    ADD CONSTRAINT "job_postings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."job_skills"
    ADD CONSTRAINT "job_skills_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."job_experiences"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."job_skills"
    ADD CONSTRAINT "job_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."library_repairs"
    ADD CONSTRAINT "library_repairs_applied_by_fkey" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."library_repairs"
    ADD CONSTRAINT "library_repairs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."match_runs"
    ADD CONSTRAINT "match_runs_jd_id_fkey" FOREIGN KEY ("jd_id") REFERENCES "public"."job_descriptions"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."match_runs"
    ADD CONSTRAINT "match_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."mcp_link_tokens"
    ADD CONSTRAINT "mcp_link_tokens_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "public"."generated_resumes"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."mcp_link_tokens"
    ADD CONSTRAINT "mcp_link_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."module_job_assignments"
    ADD CONSTRAINT "module_job_assignments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."job_experiences"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."module_job_assignments"
    ADD CONSTRAINT "module_job_assignments_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_source_resume_id_fkey" FOREIGN KEY ("source_resume_id") REFERENCES "public"."resumes"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."org_members"
    ADD CONSTRAINT "org_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."org_members"
    ADD CONSTRAINT "org_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."practice_answers"
    ADD CONSTRAINT "practice_answers_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."practice_answers"
    ADD CONSTRAINT "practice_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."prompt_feedback"
    ADD CONSTRAINT "prompt_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."resume_document_history"
    ADD CONSTRAINT "resume_document_history_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."resume_documents"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."resume_documents"
    ADD CONSTRAINT "resume_documents_generated_resume_id_fkey" FOREIGN KEY ("generated_resume_id") REFERENCES "public"."generated_resumes"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."resume_documents"
    ADD CONSTRAINT "resume_documents_job_description_id_fkey" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."resume_documents"
    ADD CONSTRAINT "resume_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."resume_generation_counts"
    ADD CONSTRAINT "resume_generation_counts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."resumes"
    ADD CONSTRAINT "resumes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."scoring_criteria"
    ADD CONSTRAINT "scoring_criteria_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."job_postings"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."skill_module_assignments"
    ADD CONSTRAINT "skill_module_assignments_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."skill_module_assignments"
    ADD CONSTRAINT "skill_module_assignments_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."job_skills"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."sprint_purchases"
    ADD CONSTRAINT "sprint_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."usage_events"
    ADD CONSTRAINT "usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_active_profile_id_fkey" FOREIGN KEY ("active_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


CREATE POLICY "Criteria accessible to job org members" ON "public"."scoring_criteria" USING (("public"."biz_user_owns_org"("public"."biz_criteria_org_id"("job_id")) OR "public"."biz_user_is_org_member"("public"."biz_criteria_org_id"("job_id")))) WITH CHECK (("public"."biz_user_owns_org"("public"."biz_criteria_org_id"("job_id")) OR "public"."biz_user_is_org_member"("public"."biz_criteria_org_id"("job_id"))));


CREATE POLICY "Criterion scores accessible to org members" ON "public"."applicant_criterion_scores" USING (("public"."biz_user_owns_org"("public"."biz_applicant_org_id"("applicant_id")) OR "public"."biz_user_is_org_member"("public"."biz_applicant_org_id"("applicant_id")))) WITH CHECK (("public"."biz_user_owns_org"("public"."biz_applicant_org_id"("applicant_id")) OR "public"."biz_user_is_org_member"("public"."biz_applicant_org_id"("applicant_id"))));


CREATE POLICY "Deny all client access" ON "public"."beta_codes" USING (false);


CREATE POLICY "Members can read their own membership" ON "public"."org_members" FOR SELECT USING (("auth"."uid"() = "user_id"));


CREATE POLICY "Notes accessible to org members" ON "public"."applicant_notes" USING (("public"."biz_user_owns_org"("public"."biz_applicant_org_id"("applicant_id")) OR "public"."biz_user_is_org_member"("public"."biz_applicant_org_id"("applicant_id")))) WITH CHECK (("auth"."uid"() = "user_id"));


CREATE POLICY "Org members access applicants" ON "public"."applicants" USING (("public"."biz_user_owns_org"("org_id") OR "public"."biz_user_is_org_member"("org_id"))) WITH CHECK (("public"."biz_user_owns_org"("org_id") OR "public"."biz_user_is_org_member"("org_id")));


CREATE POLICY "Org members access job postings" ON "public"."job_postings" USING (("public"."biz_user_owns_org"("org_id") OR "public"."biz_user_is_org_member"("org_id"))) WITH CHECK (("public"."biz_user_owns_org"("org_id") OR "public"."biz_user_is_org_member"("org_id")));


CREATE POLICY "Org members can read their org" ON "public"."organizations" FOR SELECT USING ("public"."biz_user_is_org_member"("id"));


CREATE POLICY "Org owners manage members" ON "public"."org_members" USING ("public"."biz_user_owns_org"("org_id")) WITH CHECK ("public"."biz_user_owns_org"("org_id"));


CREATE POLICY "Org owners manage their org" ON "public"."organizations" USING (("auth"."uid"() = "owner_id")) WITH CHECK (("auth"."uid"() = "owner_id"));


CREATE POLICY "Public can insert signups" ON "public"."hr_waitlist_signups" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);


CREATE POLICY "Status history insert by org members" ON "public"."applicant_status_history" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("public"."biz_user_owns_org"("public"."biz_applicant_org_id"("applicant_id")) OR "public"."biz_user_is_org_member"("public"."biz_applicant_org_id"("applicant_id")))));


CREATE POLICY "Status history readable by org members" ON "public"."applicant_status_history" FOR SELECT USING (("public"."biz_user_owns_org"("public"."biz_applicant_org_id"("applicant_id")) OR "public"."biz_user_is_org_member"("public"."biz_applicant_org_id"("applicant_id"))));


CREATE POLICY "Users manage own education" ON "public"."education" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


CREATE POLICY "Users manage own profiles" ON "public"."user_profiles" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


ALTER TABLE "public"."applicant_criterion_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."applicant_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."applicant_status_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."applicants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."beta_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."beta_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."beta_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "documents_own" ON "public"."documents" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


ALTER TABLE "public"."draft_generations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "draft_generations_own" ON "public"."draft_generations" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


ALTER TABLE "public"."education" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "education_own_delete" ON "public"."education" FOR DELETE USING (("auth"."uid"() = "user_id"));


CREATE POLICY "education_own_insert" ON "public"."education" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


CREATE POLICY "education_own_select" ON "public"."education" FOR SELECT USING (("auth"."uid"() = "user_id"));


CREATE POLICY "education_own_update" ON "public"."education" FOR UPDATE USING (("auth"."uid"() = "user_id"));


ALTER TABLE "public"."generated_resumes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."home_step_dismissals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "home_step_dismissals_own" ON "public"."home_step_dismissals" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


ALTER TABLE "public"."hr_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_library_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_partner_applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_unsubscribes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_waitlist_signups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interview_prep_cache" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "interview_prep_cache_own" ON "public"."interview_prep_cache" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


ALTER TABLE "public"."interview_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "interview_sessions_delete_own" ON "public"."interview_sessions" FOR DELETE USING (("auth"."uid"() = "user_id"));


CREATE POLICY "interview_sessions_select_own" ON "public"."interview_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));


ALTER TABLE "public"."interviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "interviews_own" ON "public"."interviews" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


ALTER TABLE "public"."job_applications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_applications_own" ON "public"."job_applications" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


ALTER TABLE "public"."job_descriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_experiences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_postings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_skills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."library_repairs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "library_repairs_admin_read" ON "public"."library_repairs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."is_admin" = true)))));


ALTER TABLE "public"."match_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "match_runs_own" ON "public"."match_runs" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


ALTER TABLE "public"."mcp_link_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mcp_link_tokens_own_insert" ON "public"."mcp_link_tokens" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


CREATE POLICY "mcp_link_tokens_own_select" ON "public"."mcp_link_tokens" FOR SELECT USING (("auth"."uid"() = "user_id"));


ALTER TABLE "public"."module_job_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."modules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."org_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own" ON "public"."generated_resumes" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "own" ON "public"."job_descriptions" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "own" ON "public"."job_experiences" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "own" ON "public"."job_skills" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "own" ON "public"."module_job_assignments" USING ((EXISTS ( SELECT 1
   FROM "public"."modules"
  WHERE (("modules"."id" = "module_job_assignments"."module_id") AND ("modules"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."modules"
  WHERE (("modules"."id" = "module_job_assignments"."module_id") AND ("modules"."user_id" = "auth"."uid"())))));


CREATE POLICY "own" ON "public"."modules" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "own" ON "public"."resume_generation_counts" USING (("user_id" = "auth"."uid"()));


CREATE POLICY "own" ON "public"."resumes" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "own" ON "public"."skill_module_assignments" USING ((EXISTS ( SELECT 1
   FROM "public"."job_skills"
  WHERE (("job_skills"."id" = "skill_module_assignments"."skill_id") AND ("job_skills"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."job_skills"
  WHERE (("job_skills"."id" = "skill_module_assignments"."skill_id") AND ("job_skills"."user_id" = "auth"."uid"())))));


CREATE POLICY "own" ON "public"."usage_events" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "own" ON "public"."users" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));


CREATE POLICY "own_insert" ON "public"."beta_feedback" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "own_select" ON "public"."beta_feedback" FOR SELECT USING (("user_id" = "auth"."uid"()));


ALTER TABLE "public"."practice_answers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "practice_answers_own" ON "public"."practice_answers" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


ALTER TABLE "public"."prompt_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prompt_feedback_admin_all" ON "public"."prompt_feedback" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));


ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rdh_own" ON "public"."resume_document_history" USING ((EXISTS ( SELECT 1
   FROM "public"."resume_documents" "d"
  WHERE (("d"."id" = "resume_document_history"."document_id") AND ("d"."user_id" = "auth"."uid"())))));


ALTER TABLE "public"."resume_document_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resume_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "resume_documents_own" ON "public"."resume_documents" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


ALTER TABLE "public"."resume_generation_counts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resumes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scoring_criteria" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."skill_module_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sprint_purchases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sprint_purchases_read_own" ON "public"."sprint_purchases" FOR SELECT USING (("auth"."uid"() = "user_id"));


ALTER TABLE "public"."stripe_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


-- pg_dump writes only GRANTs, assuming new objects start owner-only. Supabase's default
-- privileges instead give anon/authenticated ALL on every new table and function, so clear those
-- first; the grants below then rebuild production's exact privileges (column lockdowns included).
REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "anon", "authenticated";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM "anon", "authenticated";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "public" FROM "anon", "authenticated";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


REVOKE ALL ON FUNCTION "public"."apply_library_repair"("p_user_id" "uuid", "p_plan" "jsonb", "p_applied_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_library_repair"("p_user_id" "uuid", "p_plan" "jsonb", "p_applied_by" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."apply_sprint_purchase"("p_user_id" "uuid", "p_sku" "text", "p_session_id" "text", "p_amount_cents" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_sprint_purchase"("p_user_id" "uuid", "p_sku" "text", "p_session_id" "text", "p_amount_cents" integer) TO "service_role";


GRANT ALL ON FUNCTION "public"."biz_applicant_org_id"("p_applicant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."biz_applicant_org_id"("p_applicant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."biz_applicant_org_id"("p_applicant_id" "uuid") TO "service_role";


GRANT ALL ON FUNCTION "public"."biz_criteria_org_id"("p_job_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."biz_criteria_org_id"("p_job_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."biz_criteria_org_id"("p_job_id" "uuid") TO "service_role";


GRANT ALL ON FUNCTION "public"."biz_user_is_org_member"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."biz_user_is_org_member"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."biz_user_is_org_member"("p_org_id" "uuid") TO "service_role";


GRANT ALL ON FUNCTION "public"."biz_user_owns_org"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."biz_user_owns_org"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."biz_user_owns_org"("p_org_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


GRANT ALL ON FUNCTION "public"."increment_applicant_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_applicant_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_applicant_count"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."increment_overage_credits"("p_user_id" "uuid", "p_month" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_overage_credits"("p_user_id" "uuid", "p_month" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."increment_resume_count"("p_user_id" "uuid", "p_month" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_resume_count"("p_user_id" "uuid", "p_month" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."increment_resume_credits"("p_user_id" "uuid", "p_amount" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_resume_credits"("p_user_id" "uuid", "p_amount" integer) TO "service_role";


REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."purge_expired_temp_files"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_expired_temp_files"() TO "service_role";


GRANT ALL ON FUNCTION "public"."set_job_applications_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_job_applications_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_job_applications_updated_at"() TO "service_role";


GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."undo_library_repair"("p_repair_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."undo_library_repair"("p_repair_id" "uuid") TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."applicant_criterion_scores" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."applicant_criterion_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."applicant_criterion_scores" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."applicant_notes" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."applicant_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."applicant_notes" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."applicant_status_history" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."applicant_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."applicant_status_history" TO "service_role";


GRANT SELECT,MAINTAIN ON TABLE "public"."applicants" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."applicants" TO "authenticated";
GRANT ALL ON TABLE "public"."applicants" TO "service_role";


GRANT INSERT("org_id") ON TABLE "public"."applicants" TO "authenticated";


GRANT INSERT("job_id") ON TABLE "public"."applicants" TO "authenticated";


GRANT INSERT("name"),UPDATE("name") ON TABLE "public"."applicants" TO "authenticated";


GRANT INSERT("email") ON TABLE "public"."applicants" TO "authenticated";


GRANT INSERT("raw_text") ON TABLE "public"."applicants" TO "authenticated";


GRANT UPDATE("parsed_headline") ON TABLE "public"."applicants" TO "authenticated";


GRANT UPDATE("overall_score") ON TABLE "public"."applicants" TO "authenticated";


GRANT UPDATE("has_dealbreaker") ON TABLE "public"."applicants" TO "authenticated";


GRANT INSERT("status"),UPDATE("status") ON TABLE "public"."applicants" TO "authenticated";


GRANT INSERT("source") ON TABLE "public"."applicants" TO "authenticated";


GRANT UPDATE("scored_at") ON TABLE "public"."applicants" TO "authenticated";


GRANT UPDATE("ai_check_result") ON TABLE "public"."applicants" TO "authenticated";


GRANT UPDATE("ai_checked_at") ON TABLE "public"."applicants" TO "authenticated";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."beta_codes" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."beta_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_codes" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."beta_feedback" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."beta_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_feedback" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."beta_requests" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."beta_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_requests" TO "service_role";


GRANT SELECT,MAINTAIN ON TABLE "public"."documents" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."draft_generations" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."draft_generations" TO "authenticated";
GRANT ALL ON TABLE "public"."draft_generations" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."education" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."education" TO "authenticated";
GRANT ALL ON TABLE "public"."education" TO "service_role";


GRANT SELECT,MAINTAIN ON TABLE "public"."generated_resumes" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."generated_resumes" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_resumes" TO "service_role";


GRANT UPDATE("deleted_at") ON TABLE "public"."generated_resumes" TO "authenticated";


GRANT UPDATE("status") ON TABLE "public"."generated_resumes" TO "authenticated";


GRANT SELECT,INSERT,DELETE,MAINTAIN ON TABLE "public"."home_step_dismissals" TO "authenticated";
GRANT ALL ON TABLE "public"."home_step_dismissals" TO "service_role";


GRANT ALL ON TABLE "public"."hr_config" TO "service_role";


GRANT ALL ON TABLE "public"."hr_library_requests" TO "service_role";


GRANT ALL ON TABLE "public"."hr_orders" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."hr_partner_applications" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."hr_partner_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."hr_partner_applications" TO "service_role";


GRANT ALL ON TABLE "public"."hr_products" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."hr_unsubscribes" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."hr_unsubscribes" TO "authenticated";
GRANT ALL ON TABLE "public"."hr_unsubscribes" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."hr_waitlist_signups" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."hr_waitlist_signups" TO "authenticated";
GRANT ALL ON TABLE "public"."hr_waitlist_signups" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."interview_prep_cache" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."interview_prep_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."interview_prep_cache" TO "service_role";


GRANT SELECT,MAINTAIN ON TABLE "public"."interview_sessions" TO "anon";
GRANT SELECT,DELETE,MAINTAIN ON TABLE "public"."interview_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."interview_sessions" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN ON TABLE "public"."interviews" TO "authenticated";
GRANT ALL ON TABLE "public"."interviews" TO "service_role";


GRANT UPDATE("job_application_id") ON TABLE "public"."interviews" TO "authenticated";


GRANT UPDATE("round_name") ON TABLE "public"."interviews" TO "authenticated";


GRANT UPDATE("scheduled_at") ON TABLE "public"."interviews" TO "authenticated";


GRANT UPDATE("format") ON TABLE "public"."interviews" TO "authenticated";


GRANT UPDATE("interviewers") ON TABLE "public"."interviews" TO "authenticated";


GRANT UPDATE("notes") ON TABLE "public"."interviews" TO "authenticated";


GRANT UPDATE("prep_opened_at") ON TABLE "public"."interviews" TO "authenticated";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."job_applications" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."job_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."job_applications" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."job_descriptions" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."job_descriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."job_descriptions" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."job_experiences" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."job_experiences" TO "authenticated";
GRANT ALL ON TABLE "public"."job_experiences" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."job_postings" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."job_postings" TO "authenticated";
GRANT ALL ON TABLE "public"."job_postings" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."job_skills" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."job_skills" TO "authenticated";
GRANT ALL ON TABLE "public"."job_skills" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."library_repairs" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."library_repairs" TO "authenticated";
GRANT ALL ON TABLE "public"."library_repairs" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."match_runs" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."match_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."match_runs" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."mcp_link_tokens" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."mcp_link_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."mcp_link_tokens" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."module_job_assignments" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."module_job_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."module_job_assignments" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."modules" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."modules" TO "authenticated";
GRANT ALL ON TABLE "public"."modules" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."org_members" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."org_members" TO "authenticated";
GRANT ALL ON TABLE "public"."org_members" TO "service_role";


GRANT SELECT,DELETE,MAINTAIN ON TABLE "public"."organizations" TO "anon";
GRANT SELECT,DELETE,MAINTAIN ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";


GRANT INSERT("name"),UPDATE("name") ON TABLE "public"."organizations" TO "authenticated";


GRANT INSERT("slug") ON TABLE "public"."organizations" TO "authenticated";


GRANT INSERT("owner_id") ON TABLE "public"."organizations" TO "authenticated";


GRANT SELECT,MAINTAIN ON TABLE "public"."practice_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."practice_answers" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."prompt_feedback" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."prompt_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."prompt_feedback" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."rate_limits" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limits" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."resume_document_history" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."resume_document_history" TO "authenticated";
GRANT ALL ON TABLE "public"."resume_document_history" TO "service_role";


GRANT ALL ON SEQUENCE "public"."resume_document_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."resume_document_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."resume_document_history_id_seq" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."resume_documents" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."resume_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."resume_documents" TO "service_role";


GRANT SELECT,MAINTAIN ON TABLE "public"."resume_generation_counts" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."resume_generation_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."resume_generation_counts" TO "service_role";


GRANT SELECT,MAINTAIN ON TABLE "public"."resumes" TO "anon";
GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."resumes" TO "authenticated";
GRANT ALL ON TABLE "public"."resumes" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."scoring_criteria" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."scoring_criteria" TO "authenticated";
GRANT ALL ON TABLE "public"."scoring_criteria" TO "service_role";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."skill_module_assignments" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."skill_module_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."skill_module_assignments" TO "service_role";


GRANT SELECT,MAINTAIN ON TABLE "public"."sprint_purchases" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."sprint_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."sprint_purchases" TO "service_role";


GRANT ALL ON TABLE "public"."stripe_events" TO "service_role";


GRANT SELECT,MAINTAIN ON TABLE "public"."usage_events" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."usage_events" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_events" TO "service_role";


GRANT INSERT("user_id") ON TABLE "public"."usage_events" TO "authenticated";


GRANT INSERT("action") ON TABLE "public"."usage_events" TO "authenticated";


GRANT INSERT("metadata") ON TABLE "public"."usage_events" TO "authenticated";


GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."user_profiles" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";


GRANT SELECT,DELETE,MAINTAIN ON TABLE "public"."users" TO "anon";
GRANT SELECT,DELETE,MAINTAIN ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";


GRANT UPDATE("name") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("phone") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("linkedin_url") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("location") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("summary") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("skills_onboarded_at") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("active_profile_id") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("preferences") ON TABLE "public"."users" TO "authenticated";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


RESET ALL;


-- ============================================================================================
-- Outside `public` (not in a public-schema dump; written by hand from production)
-- ============================================================================================

-- New auth users get a public.users row.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage buckets (all private).
insert into storage.buckets (id, name, public, file_size_limit) values
  ('applicant-resumes', 'applicant-resumes', false, null),
  ('documents',         'documents',         false, null),
  ('generated',         'generated',         false, null),
  ('hr-library',        'hr-library',        false, null),
  ('resumes',           'resumes',           false, 10485760),
  ('temp',              'temp',              false, null)
on conflict (id) do nothing;

-- Storage policies: users read and write only their own folder (<user id>/...). The other buckets
-- have no policies and are reached only with the service role.
create policy "generated_user_folder" on storage.objects
  as permissive for all to public
  using ((bucket_id = 'generated'::text) and ((auth.uid())::text = (storage.foldername(name))[1]));

create policy "resumes_user_folder" on storage.objects
  as permissive for all to public
  using ((bucket_id = 'resumes'::text) and ((auth.uid())::text = (storage.foldername(name))[1]));

create policy "temp_user_folder" on storage.objects
  as permissive for all to public
  using ((bucket_id = 'temp'::text) and ((auth.uid())::text = (storage.foldername(name))[1]));
