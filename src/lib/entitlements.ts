// What a user can do right now, and how much of each allowance they've used. Every gate reads
// this one place: tailored resumes (generate-resume, jobs/start, MCP), documents (upload-resume,
// upload-document), interview practice, outreach drafts, live editing and fit, application insights.
//
// Free: library and confirmations, 1 resume + 2 other documents, 2 tailored resumes, every export
// format, 1 practice round. A Sprint (30 or 90 days, one-time, never renews) unlocks the rest with
// fair-use allowances per 30 days, pooled across a 90-day Sprint. When it ends the account drops to
// Free limits; nothing is deleted or hidden.
import type { SupabaseClient } from '@supabase/supabase-js'
import { IMPORT_KINDS } from './documents'

export const FREE_LIMITS = { tailored: 2, resumes: 1, otherDocuments: 2, practiceRounds: 1, answersPerFreeRound: 15 } as const
export const FAIR_USE_PER_30_DAYS = { tailored: 100, documents: 30, graded: 60 } as const

export type SprintUser = {
  tier?: string | null
  sprint_ends_at?: string | null
  plan_period_end?: string | null
  tier_expires_at?: string | null
}
export type SprintSource = 'sprint' | 'beta_pro' | 'legacy_pro'

const future = (iso: string | null | undefined, now: Date) => !!iso && new Date(iso).getTime() > now.getTime()

/**
 * Why the user has Sprint access, or null. A paid Sprint (sprint_ends_at in the future), a
 * complimentary beta_pro grant (until tier_expires_at when one is set), or a legacy Pro
 * subscription still inside its paid period (plan_period_end).
 */
export function sprintSource(u: SprintUser | null | undefined, now = new Date()): SprintSource | null {
  if (!u) return null
  if (future(u.sprint_ends_at, now)) return 'sprint'
  if (u.tier === 'beta_pro' && (!u.tier_expires_at || future(u.tier_expires_at, now))) return 'beta_pro'
  if (u.tier === 'pro' && (future(u.plan_period_end, now) || future(u.tier_expires_at, now))) return 'legacy_pro'
  return null
}

export function hasActiveSprint(u: SprintUser | null | undefined, now = new Date()): boolean {
  return sprintSource(u, now) !== null
}

/** When access ends (null = no end date, e.g. a beta grant without one). */
export function accessEndsAt(u: SprintUser | null | undefined, now = new Date()): string | null {
  switch (sprintSource(u, now)) {
    case 'sprint': return u!.sprint_ends_at ?? null
    case 'beta_pro': return u!.tier_expires_at ?? null
    case 'legacy_pro': return [u!.plan_period_end, u!.tier_expires_at].filter(d => future(d, now)).sort().pop() ?? null
    default: return null
  }
}

export type Allowance = {
  used: number
  /** null = no cap. */
  limit: number | null
  /** lifetime (Free) or the Sprint's fair-use window. */
  window: 'lifetime' | 'sprint'
  since: string | null
}
export const remaining = (a: Allowance) => (a.limit === null ? Infinity : Math.max(0, a.limit - a.used))
export const allows = (a: Allowance, adding = 1) => a.limit === null || a.used + adding <= a.limit

export type Entitlements = {
  active: boolean
  source: SprintSource | null
  endsAt: string | null
  features: { liveEditing: boolean; outreach: boolean; insights: boolean; interviewPrep: boolean; practiceEveryRound: boolean }
  tailored: Allowance
  documents: Allowance
  resumes: Allowance
  graded: Allowance
}

/**
 * The fair-use window: the Sprint purchase covering now (its allowance scales with its length, so a
 * 90-day Sprint pools 3x the 30-day amounts), else the last 30 days for beta/legacy access.
 */
async function sprintWindow(supabase: SupabaseClient, userId: string, source: SprintSource, now: Date): Promise<{ since: string; scale: number }> {
  if (source === 'sprint') {
    const { data } = await supabase
      .from('sprint_purchases')
      .select('starts_at, ends_at')
      .eq('user_id', userId)
      .lte('starts_at', now.toISOString())
      .gt('ends_at', now.toISOString())
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) {
      const days = (new Date(data.ends_at).getTime() - new Date(data.starts_at).getTime()) / 86_400_000
      return { since: data.starts_at, scale: Math.max(1, Math.round(days / 30)) }
    }
  }
  return { since: new Date(now.getTime() - 30 * 86_400_000).toISOString(), scale: 1 }
}

export async function loadSprintUser(supabase: SupabaseClient, userId: string): Promise<SprintUser | null> {
  const { data } = await supabase.from('users').select('tier, sprint_ends_at, plan_period_end, tier_expires_at').eq('id', userId).maybeSingle()
  return data ?? null
}

/** The user's access and every allowance. Counts that fail read as 0, so a hiccup never blocks. */
export async function entitlements(supabase: SupabaseClient, userId: string, now = new Date(), user?: SprintUser | null): Promise<Entitlements> {
  const u = user ?? await loadSprintUser(supabase, userId)
  const source = sprintSource(u, now)
  const active = source !== null
  const win = active ? await sprintWindow(supabase, userId, source!, now) : null
  const since = win?.since ?? null

  const base = (table: string) => {
    let q = supabase.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId)
    if (since) q = q.gte('created_at', since)
    return q
  }
  const n = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0
  const [tailoredUsed, resumeUploads, otherDocs, allDocs, graded] = await Promise.all([
    // Deleted rows still count, so deleting never frees a slot.
    n(base('generated_resumes')),
    n(base('resumes')),
    n(base('documents').in('kind', [...IMPORT_KINDS])),
    n(base('documents').in('kind', ['resume', ...IMPORT_KINDS])),
    n(base('practice_answers')),
  ])

  const scale = win?.scale ?? 1
  const sprintAllowance = (used: number, per30: number): Allowance => ({ used, limit: per30 * scale, window: 'sprint', since })
  const freeAllowance = (used: number, limit: number): Allowance => ({ used, limit, window: 'lifetime', since: null })

  return {
    active,
    source,
    endsAt: accessEndsAt(u, now),
    features: { liveEditing: active, outreach: active, insights: active, interviewPrep: active, practiceEveryRound: active },
    tailored: active ? sprintAllowance(tailoredUsed, FAIR_USE_PER_30_DAYS.tailored) : freeAllowance(tailoredUsed, FREE_LIMITS.tailored),
    documents: active ? sprintAllowance(allDocs, FAIR_USE_PER_30_DAYS.documents) : freeAllowance(otherDocs, FREE_LIMITS.otherDocuments),
    resumes: active ? sprintAllowance(allDocs, FAIR_USE_PER_30_DAYS.documents) : freeAllowance(resumeUploads, FREE_LIMITS.resumes),
    graded: active ? sprintAllowance(graded, FAIR_USE_PER_30_DAYS.graded) : { used: graded, limit: null, window: 'lifetime', since: null },
  }
}

// ─── The one sentence shown when a Free limit is hit (plus a "Start a 30-day Sprint" button) ────

export const LIMIT_MESSAGES = {
  tailored: `The Free plan includes ${FREE_LIMITS.tailored} tailored resumes. A 30-day Sprint makes as many as you need.`,
  documents: `The Free plan imports ${FREE_LIMITS.otherDocuments} documents besides your resume. A 30-day Sprint imports as many as you need.`,
  resumes: `The Free plan includes ${FREE_LIMITS.resumes} resume upload. A 30-day Sprint adds as many as you need.`,
  practice: 'The Free plan includes one practice round. A 30-day Sprint lets you practice for every round.',
  feature: 'This is part of a Sprint. Your library, resumes and jobs stay free.',
  fairUse: "You've reached this Sprint's fair-use allowance. It resets with your next Sprint or in 30 days.",
} as const

export const SPRINT_REQUIRED_CODE = 'sprint_required'

/** For routes behind a Sprint: null when allowed, else the JSON body for a 402. */
export async function sprintRequired(supabase: SupabaseClient, userId: string): Promise<null | { error: string; code: string }> {
  return hasActiveSprint(await loadSprintUser(supabase, userId)) ? null : { error: LIMIT_MESSAGES.feature, code: SPRINT_REQUIRED_CODE }
}
