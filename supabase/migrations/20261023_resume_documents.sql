-- The resume as a live document. generate-resume writes one row per generated resume; the
-- editor on /resumes/[id] PATCHes `doc` with optimistic concurrency on `version`; downloads
-- render from `doc`. Shape: src/lib/resume-doc.ts.
create table if not exists public.resume_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  job_description_id uuid references public.job_descriptions(id) on delete set null,
  generated_resume_id uuid references public.generated_resumes(id) on delete set null,
  doc jsonb not null,
  version integer not null default 1,
  -- Server-side fit score of the current doc text (the stored number; the editor's live
  -- score is a client-side preview of it). { overall, criteria[], doc_version, generated_at }
  fit_report jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists idx_resume_documents_generated_resume on public.resume_documents(generated_resume_id);
alter table public.resume_documents enable row level security;
drop policy if exists resume_documents_own on public.resume_documents;
create policy resume_documents_own on public.resume_documents for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One row per save, last 50 kept per document (pruned by the PATCH route).
create table if not exists public.resume_document_history (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.resume_documents(id) on delete cascade,
  version integer not null,
  doc jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_resume_document_history_doc on public.resume_document_history(document_id, version desc);
alter table public.resume_document_history enable row level security;
drop policy if exists rdh_own on public.resume_document_history;
create policy rdh_own on public.resume_document_history for all
  using (exists (select 1 from public.resume_documents d where d.id = document_id and d.user_id = auth.uid()));
