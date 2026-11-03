// The counts behind the plan limits in plan.ts, shared by the web routes and the MCP server so
// both read the same numbers (MCP has no quota of its own). A failed count reads as 0, as the
// routes always did: a database hiccup never blocks a user.
import type { SupabaseClient } from '@supabase/supabase-js'

/** Resumes generated since the start of the current UTC month (deleted ones still count). */
export async function generationsThisMonth(supabase: SupabaseClient, userId: string): Promise<number> {
  const now = new Date()
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const { count } = await supabase
    .from('generated_resumes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfMonth)
  return count ?? 0
}

/** Modules across all profiles that are not deleted, as counted against moduleLimit(). */
export async function activeModuleCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase
    .from('modules')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null)
  return count ?? 0
}
