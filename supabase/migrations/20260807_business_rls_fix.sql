-- Fix infinite recursion in business RLS policies (42P17)
-- Root cause: organizations policy queries org_members, org_members policy
-- queries organizations — circular reference at evaluation time.
-- Fix: security definer functions bypass RLS, breaking the cycle.

-- ── Security definer helpers ──────────────────────────────────────────────────
-- These run with elevated privileges so RLS doesn't apply inside them,
-- preventing the recursive policy evaluation.

create or replace function public.biz_user_is_org_member(p_org_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.org_members
    where org_members.org_id = p_org_id
      and org_members.user_id = auth.uid()
  );
$$;

create or replace function public.biz_user_owns_org(p_org_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.organizations
    where id = p_org_id
      and owner_id = auth.uid()
  );
$$;

-- ── Drop the cross-referencing policies ──────────────────────────────────────

drop policy if exists "Org members can read their org" on public.organizations;
drop policy if exists "Org owners manage members" on public.org_members;
drop policy if exists "Org members access job postings" on public.job_postings;
drop policy if exists "Criteria accessible to job org members" on public.scoring_criteria;
drop policy if exists "Org members access applicants" on public.applicants;
drop policy if exists "Criterion scores accessible to org members" on public.applicant_criterion_scores;
drop policy if exists "Notes accessible to org members" on public.applicant_notes;
drop policy if exists "Status history readable by org members" on public.applicant_status_history;
drop policy if exists "Status history insert by org members" on public.applicant_status_history;

-- ── Recreate all policies using the helper functions ─────────────────────────

-- organizations: members can read (no recursion — helper bypasses RLS)
create policy "Org members can read their org"
  on public.organizations for select
  using (public.biz_user_is_org_member(id));

-- org_members: owners can manage (no recursion — helper bypasses RLS)
create policy "Org owners manage members"
  on public.org_members for all
  using (public.biz_user_owns_org(org_id))
  with check (public.biz_user_owns_org(org_id));

-- job_postings
create policy "Org members access job postings"
  on public.job_postings for all
  using (
    public.biz_user_owns_org(org_id) or
    public.biz_user_is_org_member(org_id)
  )
  with check (
    public.biz_user_owns_org(org_id) or
    public.biz_user_is_org_member(org_id)
  );

-- scoring_criteria (via job_postings.org_id)
create or replace function public.biz_criteria_org_id(p_job_id uuid)
returns uuid language sql security definer stable
set search_path = public as $$
  select org_id from public.job_postings where id = p_job_id;
$$;

create policy "Criteria accessible to job org members"
  on public.scoring_criteria for all
  using (
    public.biz_user_owns_org(public.biz_criteria_org_id(job_id)) or
    public.biz_user_is_org_member(public.biz_criteria_org_id(job_id))
  )
  with check (
    public.biz_user_owns_org(public.biz_criteria_org_id(job_id)) or
    public.biz_user_is_org_member(public.biz_criteria_org_id(job_id))
  );

-- applicants
create policy "Org members access applicants"
  on public.applicants for all
  using (
    public.biz_user_owns_org(org_id) or
    public.biz_user_is_org_member(org_id)
  )
  with check (
    public.biz_user_owns_org(org_id) or
    public.biz_user_is_org_member(org_id)
  );

-- applicant_criterion_scores (via applicant's org_id)
create or replace function public.biz_applicant_org_id(p_applicant_id uuid)
returns uuid language sql security definer stable
set search_path = public as $$
  select org_id from public.applicants where id = p_applicant_id;
$$;

create policy "Criterion scores accessible to org members"
  on public.applicant_criterion_scores for all
  using (
    public.biz_user_owns_org(public.biz_applicant_org_id(applicant_id)) or
    public.biz_user_is_org_member(public.biz_applicant_org_id(applicant_id))
  )
  with check (
    public.biz_user_owns_org(public.biz_applicant_org_id(applicant_id)) or
    public.biz_user_is_org_member(public.biz_applicant_org_id(applicant_id))
  );

-- applicant_notes
create policy "Notes accessible to org members"
  on public.applicant_notes for all
  using (
    public.biz_user_owns_org(public.biz_applicant_org_id(applicant_id)) or
    public.biz_user_is_org_member(public.biz_applicant_org_id(applicant_id))
  )
  with check (auth.uid() = user_id);

-- applicant_status_history
create policy "Status history readable by org members"
  on public.applicant_status_history for select
  using (
    public.biz_user_owns_org(public.biz_applicant_org_id(applicant_id)) or
    public.biz_user_is_org_member(public.biz_applicant_org_id(applicant_id))
  );

create policy "Status history insert by org members"
  on public.applicant_status_history for insert
  with check (auth.uid() = user_id);
