// Plan limits for MCP tool calls. MCP shares the web app's limits exactly: same tier column,
// same counts (src/lib/usage-limits.ts), same gates (src/lib/plan.ts). Over a limit, a tool
// returns a readable error with the pricing link instead of doing the work.
import { canGenerateThisMonth, FREE_MONTHLY_GENERATIONS, isProTier, moduleLimit } from '@/lib/plan'
import { activeModuleCount, generationsThisMonth } from '@/lib/usage-limits'
import { ToolError, type ToolEnv } from './run-tool'
import { appUrl } from './urls'

export type PlanUsage = {
  plan: 'pro' | 'free'
  resumes_this_month: number
  monthly_resume_limit: number | null
  modules: number
  module_limit: number | null
}

async function userTier(env: ToolEnv): Promise<string> {
  const { data } = await env.supabase.from('users').select('tier').eq('id', env.userId).maybeSingle()
  return (data?.tier as string | null) ?? 'free'
}

/** Current plan and usage against its limits (null limit = unlimited). */
export async function planUsage(env: ToolEnv): Promise<PlanUsage> {
  const [tier, resumes, modules] = await Promise.all([
    userTier(env),
    generationsThisMonth(env.supabase, env.userId),
    activeModuleCount(env.supabase, env.userId),
  ])
  const pro = isProTier(tier)
  const cap = moduleLimit(tier)
  return {
    plan: pro ? 'pro' : 'free',
    resumes_this_month: resumes,
    monthly_resume_limit: pro ? null : FREE_MONTHLY_GENERATIONS,
    modules,
    module_limit: Number.isFinite(cap) ? cap : null,
  }
}

const upgrade = () => `Upgrading to Pro removes this limit: ${appUrl('/pricing')}`

/** Throws a tool error when the user has used this month's free resumes. */
export async function requireGenerationQuota(env: ToolEnv): Promise<void> {
  const tier = await userTier(env)
  if (isProTier(tier)) return
  const used = await generationsThisMonth(env.supabase, env.userId)
  if (!canGenerateThisMonth(tier, used)) {
    throw new ToolError(
      `The user has used all ${FREE_MONTHLY_GENERATIONS} free resumes for this month. They reset on the 1st. ${upgrade()}`,
    )
  }
}

/** Throws a tool error when adding `adding` modules would pass the plan's module limit. */
export async function requireModuleRoom(env: ToolEnv, adding = 1): Promise<void> {
  const tier = await userTier(env)
  const cap = moduleLimit(tier)
  if (!Number.isFinite(cap)) return
  const count = await activeModuleCount(env.supabase, env.userId)
  if (count + adding > cap) {
    throw new ToolError(
      `The user's library is at the free plan's limit of ${cap} modules (they have ${count}). They can delete modules they no longer need at ${appUrl('/library')}. ${upgrade()}`,
    )
  }
}

/** Throws a tool error unless the user is on Pro (paid or complimentary). */
export async function requirePro(env: ToolEnv, feature: string): Promise<void> {
  if (isProTier(await userTier(env))) return
  throw new ToolError(`${feature} is a Pro feature. ${appUrl('/pricing')}`)
}
