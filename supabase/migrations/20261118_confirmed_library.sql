-- Confirmed library: nothing parsed from a document is used until the user confirms it.
-- modules.status already existed with an unused check ('complete','needs-review','needs-add';
-- every row was 'needs-review'), so the check is replaced before the backfill.
alter table public.modules drop constraint if exists modules_status_check;

-- Existing modules become confirmed, so no one loses access to their library.
-- (Soft-deleted rows get the same value so every row satisfies the new check.)
update public.modules set status = 'confirmed'
  where status is null or status not in ('draft','confirmed','rejected');

alter table public.modules add constraint modules_status_check check (status in ('draft','confirmed','rejected'));
alter table public.modules alter column status set default 'draft';
alter table public.modules add column if not exists source_quote text;       -- the line in the source doc this came from
alter table public.modules add column if not exists source_document_id uuid; -- documents.id (FK added with the documents table)
create index if not exists modules_user_status on public.modules(user_id, status) where deleted_at is null;
