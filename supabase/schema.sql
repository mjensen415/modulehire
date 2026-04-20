-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users (extends Supabase auth.users)
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  name text,
  plan text not null default 'free' check (plan in ('free', 'pro')), -- 'free' | 'pro'
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Source resumes (uploaded files)
create table public.resumes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade not null,
  filename text not null,
  file_url text,           -- Supabase Storage URL (Pro users only)
  raw_text text not null,  -- Extracted text (stored for all users)
  parsed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Modules (the core data entity)
create table public.modules (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade not null,
  source_resume_id uuid references public.resumes(id) on delete set null,

  -- Classification
  type text not null check (type in ('experience', 'skill', 'story', 'positioning')),
  weight text not null default 'strong' check (weight in ('anchor', 'strong', 'supporting')),
  status text not null default 'needs-review' check (status in ('complete', 'needs-review', 'needs-add')),

  -- Content
  title text not null,
  content text not null,

  -- Source identity (for experience modules)
  source_company text,
  source_role_title text,
  date_start text,
  date_end text,
  employment_type text check (employment_type in ('full-time', 'consulting', 'contract', 'board', 'volunteer')),

  -- Matching tags (arrays)
  role_types text[] not null default '{}',
  themes text[] not null default '{}',
  company_stage text[] not null default '{"any"}',

  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Job descriptions
create table public.job_descriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade not null,
  raw_text text not null,
  source_type text not null check (source_type in ('paste', 'upload', 'url')),
  source_url text,

  -- Extracted by AI
  extracted_company text,
  extracted_role_type text,
  extracted_themes text[] not null default '{}',
  extracted_seniority text,
  extracted_phrases text[] not null default '{}', -- exact phrases to mirror

  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Generated resumes
create table public.generated_resumes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade not null,
  job_description_id uuid references public.job_descriptions(id) on delete set null,
  title text not null,
  module_ids_used uuid[] not null default '{}',
  positioning_variant text check (positioning_variant in ('A', 'B', 'C', 'D')),
  company_color_hex text default '#00B4B4',
  docx_url text,          -- Supabase Storage URL (Pro users or Temp path for Free)
  pdf_url text,           -- Supabase Storage URL (Pro users or Temp path for Free)
  is_temp boolean not null default true,
  expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_modules_user_id on public.modules(user_id);
create index idx_modules_type on public.modules(type);
create index idx_modules_themes on public.modules using gin(themes);
create index idx_modules_role_types on public.modules using gin(role_types);
create index idx_modules_deleted_at on public.modules(deleted_at);
create index idx_resumes_deleted_at on public.resumes(deleted_at);
create index idx_generated_resumes_user_id on public.generated_resumes(user_id);
create index idx_job_descriptions_user_id on public.job_descriptions(user_id);
create index idx_generated_resumes_expires_at on public.generated_resumes(expires_at) where is_temp = true;

-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.resumes enable row level security;
alter table public.modules enable row level security;
alter table public.job_descriptions enable row level security;
alter table public.generated_resumes enable row level security;

-- Users: can only see and edit their own row
create policy "users_own_row" on public.users
  for all using (auth.uid() = id);

-- All other tables: user owns their data
create policy "resumes_own" on public.resumes
  for all using (auth.uid() = user_id);

create policy "modules_own" on public.modules
  for all using (auth.uid() = user_id);

create policy "job_descriptions_own" on public.job_descriptions
  for all using (auth.uid() = user_id);

create policy "generated_resumes_own" on public.generated_resumes
  for all using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger modules_updated_at
  before update on public.modules
  for each row execute function public.set_updated_at();

create trigger users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Auto-create user row on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Storage: users can only read/write their own folder
-- Note: 'resumes' and 'generated' buckets must be created manually in Supabase UI first
create policy "resumes_user_folder" on storage.objects
  for all using (
    bucket_id = 'resumes' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "generated_user_folder" on storage.objects
  for all using (
    bucket_id = 'generated' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "temp_user_folder" on storage.objects
  for all using (
    bucket_id = 'temp' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Purge function for cron
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
