// Plan limits for MCP tool calls. MCP shares the web app's limits exactly through
// src/lib/entitlements.ts. Over a limit, a tool returns a readable error with the pricing link
// instead of doing the work.
import { allows, entitlements, FREE_LIMITS, hasActiveSprint, loadSprintUser } from '@/lib/entitlements'
import { ToolError, type ToolEnv } from './run-tool'
import { appUrl } from './urls'

export type PlanUsage = {
  plan: 'sprint' | 'free'
  sprint_ends_at: string | null
  tailored_resumes_used: number
  tailored_resume_limit: number | null
}

/** Current plan and tailored-resume usage (null limit = no cap). */
export async function planUsage(env: ToolEnv): Promise<PlanUsage> {
  const ent = await entitlements(env.supabase, env.userId)
  return {
    plan: ent.active ? 'sprint' : 'free',
    sprint_ends_at: ent.endsAt,
    tailored_resumes_used: ent.tailored.used,
    tailored_resume_limit: ent.tailored.limit,
  }
}

const sprintLink = () => `A 30-day Sprint ($19, one payment, never renews) lifts it: ${appUrl('/pricing')}`

/** Throws a tool error when the user is out of tailored resumes. */
export async function requireGenerationQuota(env: ToolEnv): Promise<void> {
  const ent = await entitlements(env.supabase, env.userId)
  if (allows(ent.tailored)) return
  throw new ToolError(ent.active
    ? "The user has reached this Sprint's fair-use allowance for tailored resumes."
    : `The user has made the ${FREE_LIMITS.tailored} tailored resumes the Free plan includes. ${sprintLink()}`)
}

/** The module library is free on every plan. Kept so callers don't change. */
export async function requireModuleRoom(_env: ToolEnv, _adding = 1): Promise<void> {
  void _env; void _adding
}

/** Throws a tool error unless the user has an active Sprint. */
export async function requirePro(env: ToolEnv, feature: string): Promise<void> {
  if (hasActiveSprint(await loadSprintUser(env.supabase, env.userId))) return
  throw new ToolError(`${feature} comes with a Sprint. ${sprintLink()}`)
}
