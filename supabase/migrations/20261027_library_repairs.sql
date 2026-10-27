-- Admin library health tool (/admin/library-health). Repairs old parse damage in one user's
-- library on request — never automatically. Each applied repair is one transaction with an audit
-- row holding the plan and the before-state, so it can be undone.

create table if not exists public.library_repairs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- { plan: [ops], before: { modules, jobs, links }, counts }
  summary jsonb not null,
  applied_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create index if not exists idx_library_repairs_user on public.library_repairs(user_id, created_at desc);
alter table public.library_repairs enable row level security;
-- Admins can read the audit trail; writes only go through the functions below (service role).
drop policy if exists library_repairs_admin_read on public.library_repairs;
create policy library_repairs_admin_read on public.library_repairs for select
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true));

-- Plan ops (jsonb array):
--   { "op": "link",        "module_id", "job_id" }               link an unlinked module to a job
--   { "op": "hide",        "module_id", "kept_id" }              soft-delete a duplicate copy
--   { "op": "positioning", "module_id" }                         multi-company → career-level
--   { "op": "job_dates",   "job_id", "start_date", "end_date" }  reset job dates (text, as stored)
create or replace function public.apply_library_repair(p_user_id uuid, p_plan jsonb, p_applied_by uuid)
returns uuid
language plpgsql
set search_path = public
as $$
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

  -- Every module and job in the plan must belong to this user.
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
    -- Links in the plan that already existed: undo must not remove them.
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

create or replace function public.undo_library_repair(p_repair_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  r library_repairs%rowtype;
begin
  select * into r from library_repairs where id = p_repair_id for update;
  if not found then raise exception 'repair not found'; end if;
  if r.undone_at is not null then raise exception 'repair already undone'; end if;

  -- Remove only the links this repair added.
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

-- Server (service role) only.
revoke all on function public.apply_library_repair(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.undo_library_repair(uuid) from public, anon, authenticated;
grant execute on function public.apply_library_repair(uuid, jsonb, uuid) to service_role;
grant execute on function public.undo_library_repair(uuid) to service_role;
