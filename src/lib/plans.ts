import { createClient } from './supabase/server';

export type Plan = 'free' | 'standard' | 'pro';

export const PLAN_LIMITS = {
  free:     { modules: 10,        resumes_per_month: 3,  matches_per_month: 3,  permanent_storage: false },
  standard: { modules: 50,        resumes_per_month: 15, matches_per_month: -1, permanent_storage: true  },
  pro:      { modules: -1,        resumes_per_month: -1, matches_per_month: -1, permanent_storage: true  },
} as const satisfies Record<Plan, {
  modules: number;
  resumes_per_month: number;
  matches_per_month: number;
  permanent_storage: boolean;
}>;

export type LimitAction = 'generate_resume' | 'match_job' | 'upload_resume';

export interface UserPlanContext {
  plan: Plan;
  is_admin: boolean;
  module_count: number;
  resumes_this_month: number;
  matches_this_month: number;
}

/** Returns null if allowed, or a human-readable reason string if blocked. */
export function checkLimit(ctx: UserPlanContext, action: LimitAction): string | null {
  if (ctx.is_admin) return null;
  const limits = PLAN_LIMITS[ctx.plan];

  if (action === 'generate_resume') {
    if (limits.resumes_per_month !== -1 && ctx.resumes_this_month >= limits.resumes_per_month) {
      return `You've used all ${limits.resumes_per_month} resume generations for this month on the ${ctx.plan} plan.`;
    }
  }
  if (action === 'match_job') {
    if (limits.matches_per_month !== -1 && ctx.matches_this_month >= limits.matches_per_month) {
      return `You've used all ${limits.matches_per_month} job matches for this month on the ${ctx.plan} plan.`;
    }
  }
  if (action === 'upload_resume') {
    if (limits.modules !== -1 && ctx.module_count >= limits.modules) {
      return `You've reached the ${limits.modules}-module limit on the ${ctx.plan} plan.`;
    }
  }
  return null;
}

/** Fetch usage context for the current user from Supabase (server-side). */
export async function getUserPlanContext(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<UserPlanContext | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    { data: profile },
    { count: moduleCount },
    { count: resumesThisMonth },
    { count: matchesThisMonth },
  ] = await Promise.all([
    supabase.from('users').select('plan, is_admin').eq('id', user.id).single(),
    supabase.from('modules').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('deleted_at', null),
    supabase.from('usage_events').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('action', 'generate_resume').gte('created_at', monthStart.toISOString()),
    supabase.from('usage_events').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('action', 'match_job').gte('created_at', monthStart.toISOString()),
  ]);

  if (!profile) return null;

  return {
    plan: profile.plan as Plan,
    is_admin: profile.is_admin ?? false,
    module_count: moduleCount ?? 0,
    resumes_this_month: resumesThisMonth ?? 0,
    matches_this_month: matchesThisMonth ?? 0,
  };
}
