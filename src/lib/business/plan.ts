import type { SupabaseClient } from '@supabase/supabase-js'

// ModuleHire for Business plans, keyed by organizations.tier (check constraint allows
// starter | growth | enterprise). starter is the Free plan, growth is Team ($49/mo via
// Stripe, set only by the webhook with the service role), enterprise is manual.
export type OrgTier = 'starter' | 'growth' | 'enterprise'

export type BusinessPlan = {
  tier: OrgTier
  name: string
  /** Max job postings with status 'active' at once. null = unlimited. */
  activeJobs: number | null
  /** Max distinct applicants scored per calendar month (UTC). null = unlimited. */
  monthlyScores: number | null
}

export const BUSINESS_PLANS: Record<OrgTier, BusinessPlan> = {
  starter: { tier: 'starter', name: 'Free', activeJobs: 1, monthlyScores: 25 },
  growth: { tier: 'growth', name: 'Team', activeJobs: null, monthlyScores: 500 },
  enterprise: { tier: 'enterprise', name: 'Enterprise', activeJobs: null, monthlyScores: null },
}

export const TEAM_PRICE_LABEL = '$49'

export function planForTier(tier: string | null | undefined): BusinessPlan {
  return BUSINESS_PLANS[(tier as OrgTier)] ?? BUSINESS_PLANS.starter
}

export async function getOrgPlan(supabase: SupabaseClient, orgId: string): Promise<BusinessPlan> {
  const { data, error } = await supabase.from('organizations').select('tier').eq('id', orgId).single()
  if (error) console.error('[business/plan] tier lookup failed:', error)
  return planForTier(data?.tier)
}

function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

export type OrgUsage = { activeJobs: number; scoresThisMonth: number }

export async function getOrgUsage(supabase: SupabaseClient, orgId: string): Promise<OrgUsage> {
  const [jobs, scores] = await Promise.all([
    supabase.from('job_postings').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active'),
    supabase.from('applicants').select('*', { count: 'exact', head: true }).eq('org_id', orgId).gte('scored_at', monthStartIso()),
  ])
  if (jobs.error) console.error('[business/plan] active job count failed:', jobs.error)
  if (scores.error) console.error('[business/plan] monthly score count failed:', scores.error)
  return { activeJobs: jobs.count ?? 0, scoresThisMonth: scores.count ?? 0 }
}

/**
 * How many more applicants this org may score this month (Infinity when unlimited).
 * Fails open (Infinity) if the count query errors, matching checkOrgDailyScoreCap.
 */
export async function remainingMonthlyScores(supabase: SupabaseClient, orgId: string): Promise<number> {
  const plan = await getOrgPlan(supabase, orgId)
  if (plan.monthlyScores === null) return Infinity
  const { count, error } = await supabase
    .from('applicants')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('scored_at', monthStartIso())
  if (error) {
    console.error('[business/plan] monthly score count failed:', error)
    return Infinity
  }
  return Math.max(0, plan.monthlyScores - (count ?? 0))
}

/** True when the org can have one more active job posting. excludeJobId: the job being activated. */
export async function canActivateJob(supabase: SupabaseClient, orgId: string, excludeJobId?: string): Promise<boolean> {
  const plan = await getOrgPlan(supabase, orgId)
  if (plan.activeJobs === null) return true
  let q = supabase.from('job_postings').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active')
  if (excludeJobId) q = q.neq('id', excludeJobId)
  const { count, error } = await q
  if (error) {
    console.error('[business/plan] active job count failed:', error)
    return true
  }
  return (count ?? 0) < plan.activeJobs
}

export const UPGRADE_CODE = 'business_plan_limit'

export function monthlyLimitMessage(plan: BusinessPlan): string {
  return `You've used this month's ${plan.monthlyScores} applicant scores on the ${plan.name} plan. Upgrade to Team in Settings for ${BUSINESS_PLANS.growth.monthlyScores} a month.`
}

export function activeJobLimitMessage(plan: BusinessPlan): string {
  return `The ${plan.name} plan allows ${plan.activeJobs} active job at a time. Close or pause one, or upgrade to Team in Settings for unlimited jobs.`
}
