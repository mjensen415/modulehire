// Per-user rate limits for MCP tool calls, checked by runTool() before a tool runs.
//
// Counts the user's own `ev_mcp_*` rows (runTool logs one per call), so there is no separate
// counter to keep. Calls that are refused here log `ev_limit_mcp` instead, which the counts below
// don't match, so a client retrying in a loop is back in once it slows down. Fail-open on a
// database error, same as checkAndLog(). Not atomic: a burst of parallel calls can overshoot by
// the number in flight, which is fine for a cap meant to stop runaway agent loops.
//
// The limits only hold while users can't delete or backdate their usage_events rows
// (20261029_lock_usage_events.sql).
import type { SupabaseClient } from '@supabase/supabase-js'

/** Every MCP tool together. Generous: an agent editing a resume makes many small calls. */
export const MCP_LIMITS = { perMinute: 60, perHour: 600 }

/**
 * Tighter hourly caps for tools that cost more than a database read. generate_resume is left out:
 * generate-resume's own rl_generate_resume limit and the monthly plan limit already cover it.
 */
export const MCP_TOOL_HOURLY: Record<string, number> = {
  interview_prep: 10, // AI call when regenerating
  export_resume: 30, // renders a PDF or Word file
  get_editor_link: 20, // creates a sign-in link
}

export type McpLimitResult = { ok: true } | { ok: false; message: string }

async function countSince(supabase: SupabaseClient, userId: string, action: { like: string } | { eq: string }, seconds: number) {
  let q = supabase
    .from('usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - seconds * 1000).toISOString())
  q = 'like' in action ? q.like('action', action.like) : q.eq('action', action.eq)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

export async function checkMcpLimit(supabase: SupabaseClient, userId: string, tool: string): Promise<McpLimitResult> {
  const toolCap = MCP_TOOL_HOURLY[tool]
  try {
    const [minute, hour, toolHour] = await Promise.all([
      countSince(supabase, userId, { like: 'ev_mcp_%' }, 60),
      countSince(supabase, userId, { like: 'ev_mcp_%' }, 3600),
      toolCap ? countSince(supabase, userId, { eq: `ev_mcp_${tool}` }, 3600) : Promise.resolve(0),
    ])
    if (minute >= MCP_LIMITS.perMinute) {
      return { ok: false, message: `ModuleHire allows ${MCP_LIMITS.perMinute} requests a minute and this connection has reached that. Wait a minute, then try again. Tell the user rather than retrying right away.` }
    }
    if (hour >= MCP_LIMITS.perHour) {
      return { ok: false, message: `ModuleHire allows ${MCP_LIMITS.perHour} requests an hour and this account has reached that. Try again later. Tell the user rather than retrying.` }
    }
    if (toolCap && toolHour >= toolCap) {
      return { ok: false, message: `${tool} can run ${toolCap} times an hour and this account has reached that. Try again later. Tell the user rather than retrying.` }
    }
    return { ok: true }
  } catch (e) {
    console.error('[mcp limits] count failed:', e)
    return { ok: true }
  }
}
