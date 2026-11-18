-- Imported source documents: resumes, performance reviews, brag docs, interview emails.
-- Every parsed module can point back at the document it came from (modules.source_document_id).
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('resume','performance_review','brag_doc','interview_email','generated_resume','other')),
  filename text,
  file_url text,
  raw_text text,
  job_experience_id uuid references public.job_experiences(id) on delete set null,
  period_label text,          -- e.g. "2025 annual review"
  source_resume_id uuid references public.resumes(id) on delete set null, -- kind = 'resume': the resumes row it mirrors
  deleted_at timestamptz,     -- soft delete; deleted rows still count toward the Free document limit
  created_at timestamptz not null default now()
);
alter table public.documents enable row level security;
drop policy if exists documents_own on public.documents;
create policy documents_own on public.documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists documents_user_created on public.documents(user_id, created_at desc);

-- Same lockdown as resumes/applicants: the server writes rows with the service role (file_url is
-- signed with it on download, and hard deletes would reset the Free document limit). Users read
-- their own rows and change nothing directly.
revoke insert, update, delete on public.documents from anon, authenticated;
revoke truncate, references, trigger on public.documents from anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'modules_source_document_id_fkey') then
    alter table public.modules add constraint modules_source_document_id_fkey
      foreign key (source_document_id) references public.documents(id) on delete set null;
  end if;
end $$;
create index if not exists modules_source_document on public.modules(source_document_id) where source_document_id is not null;

-- Private bucket for uploaded documents: documents/{user_id}/{timestamp}-{name}. Server-side only.
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;
