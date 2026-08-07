-- ─────────────────────────────────────────────────────────────────────────────
-- ModuleHire for Business — v1 schema
-- 20260807_business_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Organizations ────────────────────────────────────────────────────────────

create table if not exists public.organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text unique,
  owner_id            uuid references auth.users(id) on delete cascade not null,
  tier                text default 'starter'
                        check (tier in ('starter', 'growth', 'enterprise')),
  stripe_customer_id  text,
  created_at          timestamptz default now()
);

alter table public.organizations enable row level security;

create policy "Org owners manage their org"
  on public.organizations for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Org members can read their org"
  on public.organizations for select
  using (
    exists (
      select 1 from public.org_members
      where org_id = public.organizations.id
        and user_id = auth.uid()
    )
  );

-- ── Org members ──────────────────────────────────────────────────────────────

create table if not exists public.org_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  role        text not null check (role in ('owner', 'admin', 'reviewer')),
  invited_at  timestamptz default now(),
  unique(org_id, user_id)
);

alter table public.org_members enable row level security;

create policy "Members can read their own membership"
  on public.org_members for select
  using (auth.uid() = user_id);

create policy "Org owners manage members"
  on public.org_members for all
  using (
    exists (
      select 1 from public.organizations
      where id = public.org_members.org_id
        and owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.organizations
      where id = public.org_members.org_id
        and owner_id = auth.uid()
    )
  );

-- ── Job postings ─────────────────────────────────────────────────────────────

create table if not exists public.job_postings (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid references public.organizations(id) on delete cascade not null,
  title               text not null,
  raw_jd              text,
  extracted_themes    text[] default '{}',
  extracted_phrases   text[] default '{}',
  extracted_seniority text,
  extracted_role_type text,
  extracted_company   text,
  status              text default 'active'
                        check (status in ('draft', 'active', 'paused', 'closed')),
  applicant_count     int default 0,
  created_by          uuid references auth.users(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

alter table public.job_postings enable row level security;

create policy "Org members access job postings"
  on public.job_postings for all
  using (
    exists (
      select 1 from public.org_members
      where org_id = public.job_postings.org_id
        and user_id = auth.uid()
    )
    or exists (
      select 1 from public.organizations
      where id = public.job_postings.org_id
        and owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.org_members
      where org_id = public.job_postings.org_id
        and user_id = auth.uid()
    )
    or exists (
      select 1 from public.organizations
      where id = public.job_postings.org_id
        and owner_id = auth.uid()
    )
  );

-- ── Scoring criteria ─────────────────────────────────────────────────────────

create table if not exists public.scoring_criteria (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid references public.job_postings(id) on delete cascade not null,
  label       text not null,
  weight      text not null check (weight in ('dealbreaker', 'must_have', 'nice_to_have')),
  description text,
  sort_order  int default 0
);

alter table public.scoring_criteria enable row level security;

create policy "Criteria accessible to job posting members"
  on public.scoring_criteria for all
  using (
    exists (
      select 1 from public.job_postings jp
      join public.org_members om on om.org_id = jp.org_id
      where jp.id = public.scoring_criteria.job_id
        and om.user_id = auth.uid()
    )
    or exists (
      select 1 from public.job_postings jp
      join public.organizations o on o.id = jp.org_id
      where jp.id = public.scoring_criteria.job_id
        and o.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.job_postings jp
      join public.org_members om on om.org_id = jp.org_id
      where jp.id = public.scoring_criteria.job_id
        and om.user_id = auth.uid()
    )
    or exists (
      select 1 from public.job_postings jp
      join public.organizations o on o.id = jp.org_id
      where jp.id = public.scoring_criteria.job_id
        and o.owner_id = auth.uid()
    )
  );

-- ── Applicants ───────────────────────────────────────────────────────────────

create table if not exists public.applicants (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid references public.organizations(id) on delete cascade not null,
  job_id          uuid references public.job_postings(id) on delete cascade not null,
  name            text,
  email           text,
  raw_text        text,
  parsed_headline text,
  overall_score   int check (overall_score >= 0 and overall_score <= 100),
  has_dealbreaker boolean default false,
  status          text default 'new'
                    check (status in ('new', 'reviewing', 'shortlisted', 'interviewing', 'offered', 'rejected')),
  source          text check (source in ('upload', 'csv', 'bulk', 'link', 'email')),
  file_url        text,
  scored_at       timestamptz,
  created_at      timestamptz default now()
);

alter table public.applicants enable row level security;

create policy "Org members access applicants"
  on public.applicants for all
  using (
    exists (
      select 1 from public.org_members
      where org_id = public.applicants.org_id
        and user_id = auth.uid()
    )
    or exists (
      select 1 from public.organizations
      where id = public.applicants.org_id
        and owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.org_members
      where org_id = public.applicants.org_id
        and user_id = auth.uid()
    )
    or exists (
      select 1 from public.organizations
      where id = public.applicants.org_id
        and owner_id = auth.uid()
    )
  );

create index if not exists applicants_job_id_idx on public.applicants(job_id);
create index if not exists applicants_overall_score_idx on public.applicants(job_id, overall_score desc);

-- ── Applicant criterion scores ────────────────────────────────────────────────

create table if not exists public.applicant_criterion_scores (
  id            uuid primary key default gen_random_uuid(),
  applicant_id  uuid references public.applicants(id) on delete cascade not null,
  criterion_id  uuid references public.scoring_criteria(id) on delete cascade not null,
  score         int check (score >= 0 and score <= 100),
  met           boolean,
  evidence      text,
  unique(applicant_id, criterion_id)
);

alter table public.applicant_criterion_scores enable row level security;

create policy "Criterion scores readable by org members"
  on public.applicant_criterion_scores for all
  using (
    exists (
      select 1 from public.applicants a
      join public.org_members om on om.org_id = a.org_id
      where a.id = public.applicant_criterion_scores.applicant_id
        and om.user_id = auth.uid()
    )
    or exists (
      select 1 from public.applicants a
      join public.organizations o on o.id = a.org_id
      where a.id = public.applicant_criterion_scores.applicant_id
        and o.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.applicants a
      join public.org_members om on om.org_id = a.org_id
      where a.id = public.applicant_criterion_scores.applicant_id
        and om.user_id = auth.uid()
    )
    or exists (
      select 1 from public.applicants a
      join public.organizations o on o.id = a.org_id
      where a.id = public.applicant_criterion_scores.applicant_id
        and o.owner_id = auth.uid()
    )
  );

-- ── Applicant notes ───────────────────────────────────────────────────────────

create table if not exists public.applicant_notes (
  id            uuid primary key default gen_random_uuid(),
  applicant_id  uuid references public.applicants(id) on delete cascade not null,
  user_id       uuid references auth.users(id) not null,
  body          text not null,
  created_at    timestamptz default now()
);

alter table public.applicant_notes enable row level security;

create policy "Notes readable by org members"
  on public.applicant_notes for all
  using (
    exists (
      select 1 from public.applicants a
      join public.org_members om on om.org_id = a.org_id
      where a.id = public.applicant_notes.applicant_id
        and om.user_id = auth.uid()
    )
    or exists (
      select 1 from public.applicants a
      join public.organizations o on o.id = a.org_id
      where a.id = public.applicant_notes.applicant_id
        and o.owner_id = auth.uid()
    )
  )
  with check (auth.uid() = user_id);

-- ── Applicant status history ──────────────────────────────────────────────────

create table if not exists public.applicant_status_history (
  id            uuid primary key default gen_random_uuid(),
  applicant_id  uuid references public.applicants(id) on delete cascade not null,
  user_id       uuid references auth.users(id),
  from_status   text,
  to_status     text,
  changed_at    timestamptz default now()
);

alter table public.applicant_status_history enable row level security;

create policy "Status history readable by org members"
  on public.applicant_status_history for select
  using (
    exists (
      select 1 from public.applicants a
      join public.org_members om on om.org_id = a.org_id
      where a.id = public.applicant_status_history.applicant_id
        and om.user_id = auth.uid()
    )
    or exists (
      select 1 from public.applicants a
      join public.organizations o on o.id = a.org_id
      where a.id = public.applicant_status_history.applicant_id
        and o.owner_id = auth.uid()
    )
  );

create policy "Status history insert by org members"
  on public.applicant_status_history for insert
  with check (auth.uid() = user_id);

-- ── Helper: increment applicant_count on insert ───────────────────────────────

create or replace function public.increment_applicant_count()
returns trigger language plpgsql security definer as $$
begin
  update public.job_postings
  set applicant_count = applicant_count + 1,
      updated_at = now()
  where id = new.job_id;
  return new;
end;
$$;

create trigger applicant_inserted
  after insert on public.applicants
  for each row execute function public.increment_applicant_count();
