import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns the caller's role in the org ('owner' | 'admin' | 'reviewer'), or null
 * if they're neither the org owner nor a member. Owner is checked separately since
 * org creation doesn't guarantee an org_members row exists for the owner.
 */
export async function getOrgRole(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<string | null> {
  const { data: org } = await supabase
    .from('organizations')
    .select('owner_id')
    .eq('id', orgId)
    .single()

  if (org?.owner_id === userId) return 'owner'

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()

  return member?.role ?? null
}

/** Looks up the org_id that owns a job posting, for routes keyed by job_id. */
export async function getJobOrgId(supabase: SupabaseClient, jobId: string): Promise<string | null> {
  const { data: job } = await supabase
    .from('job_postings')
    .select('org_id')
    .eq('id', jobId)
    .single()
  return job?.org_id ?? null
}

/** Looks up the org_id that owns an applicant, for routes keyed by applicant_id. */
export async function getApplicantOrgId(supabase: SupabaseClient, applicantId: string): Promise<string | null> {
  const { data: applicant } = await supabase
    .from('applicants')
    .select('org_id')
    .eq('id', applicantId)
    .single()
  return applicant?.org_id ?? null
}
