-- 1. Soft delete columns
alter table public.users add column if not exists deleted_at timestamptz;
alter table public.resumes add column if not exists deleted_at timestamptz;
alter table public.modules add column if not exists deleted_at timestamptz;
alter table public.job_descriptions add column if not exists deleted_at timestamptz;
alter table public.generated_resumes add column if not exists deleted_at timestamptz;

-- 2. Replace bytea blobs with temp file tracking on generated_resumes
alter table public.generated_resumes drop column if exists docx_blob;
alter table public.generated_resumes drop column if exists pdf_blob;
alter table public.generated_resumes add column if not exists is_temp boolean not null default true;
alter table public.generated_resumes add column if not exists expires_at timestamptz;

-- 3. Index for temp file purge queries
create index if not exists idx_generated_resumes_expires_at
  on public.generated_resumes (expires_at)
  where is_temp = true;

-- 4. Soft delete indexes
create index if not exists idx_modules_deleted_at on public.modules (deleted_at);
create index if not exists idx_resumes_deleted_at on public.resumes (deleted_at);

-- 5. updated_at trigger for modules
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists modules_updated_at on public.modules;
create trigger modules_updated_at
  before update on public.modules
  for each row execute function public.set_updated_at();

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- 6. plan check constraint
alter table public.users drop constraint if exists users_plan_check;
alter table public.users
  add constraint users_plan_check check (plan in ('free', 'pro'));

-- 7. Purge function (returns file paths so cron can delete from Storage)
create or replace function public.purge_expired_temp_files()
returns table(docx_path text, pdf_path text) language plpgsql security definer as $$
begin
  return query
    update public.generated_resumes
    set deleted_at = now()
    where is_temp = true
      and expires_at < now()
      and deleted_at is null
    returning docx_url, pdf_url;
end;
$$;

-- 8. Temp storage bucket RLS policy
-- Note: Must create a private 'temp' bucket in Supabase via Dashboard first
create policy "temp_user_folder" on storage.objects
  for all using (
    bucket_id = 'temp' and
    auth.uid()::text = (storage.foldername(name))[1]
  );
