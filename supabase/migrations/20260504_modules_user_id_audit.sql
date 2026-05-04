-- Run these in Supabase SQL editor in order. The first three are read-only
-- audit queries; review their output before running the destructive cleanup
-- and the constraint at the bottom.

-- =========================================================================
-- 1) AUDIT — modules with NULL user_id
-- =========================================================================
select count(*) as null_user_id_count from public.modules where user_id is null;

-- =========================================================================
-- 2) AUDIT — modules whose user_id doesn't match any public.users row
-- =========================================================================
select count(*) as orphan_count
from public.modules m
left join public.users u on u.id = m.user_id
where m.user_id is not null and u.id is null;

-- =========================================================================
-- 3) AUDIT — any module titled like 'Community Impact' (the reported leak)
-- =========================================================================
select id, user_id, title, source_company, deleted_at, created_at
from public.modules
where title ilike '%community impact%'
order by created_at desc;

-- =========================================================================
-- 4) CLEANUP — soft-delete modules with NULL user_id
--    (Run only after reviewing #1.)
-- =========================================================================
-- update public.modules
--   set deleted_at = now()
-- where user_id is null
--   and deleted_at is null;

-- =========================================================================
-- 5) CLEANUP — soft-delete orphan modules (user_id points nowhere)
--    (Run only after reviewing #2.)
-- =========================================================================
-- update public.modules
--   set deleted_at = now()
-- where deleted_at is null
--   and user_id is not null
--   and not exists (select 1 from public.users u where u.id = public.modules.user_id);

-- =========================================================================
-- 6) HARDEN — enforce NOT NULL on modules.user_id
--    Audit (2026-05-04) confirmed no NULL or orphan rows, so this is safe.
--    The FK to public.users already enforces referential integrity.
-- =========================================================================
alter table public.modules alter column user_id set not null;
