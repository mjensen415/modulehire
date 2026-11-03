// Shared wrapper for every MCP tool: resolves the signed-in user, applies the per-user rate limit
// (src/lib/mcp/limits.ts), times the call, logs it to usage_events, and turns thrown errors into
// tool errors the model can read.
//
// Logged as `ev_mcp_<tool>` because usage_events_action_check already allows the `ev_` prefix
// (20261024 migration). metadata: { client, ok, ms }. Usage by client:
//   select metadata->>'client', action, count(*) from usage_events
//   where action like 'ev_mcp_%' group by 1, 2 order by 3 desc;
import type { AuthInfo } from '@modelcontextprotocol/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mcpUser } from './auth'
import { checkMcpLimit } from './limits'

// `token` is the caller's bearer token, forwarded only on in-process calls into this app's own
// route handlers (generate_resume → /api/jobs/start); never returned to the model.
export type ToolEnv = { userId: string; email: string | null; client: string; supabase: SupabaseClient; token: string }

/** A message meant for the user (not a crash). Shown to the model as-is. */
export class ToolError extends Error {}

export type ToolResult = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean }

export function json(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

export async function runTool(
  name: string,
  authInfo: AuthInfo | undefined,
  fn: (env: ToolEnv) => Promise<ToolResult>,
): Promise<ToolResult> {
  const started = Date.now()
  let env: ToolEnv
  try {
    env = mcpUser(authInfo)
  } catch (e) {
    return { content: [{ type: 'text', text: (e as Error).message }], isError: true }
  }

  // Refused calls log ev_limit_mcp, not ev_mcp_<tool>, so they don't count toward the limit.
  const limit = await checkMcpLimit(env.supabase, env.userId, name)
  if (!limit.ok) {
    const { error } = await env.supabase
      .from('usage_events')
      .insert({ user_id: env.userId, action: 'ev_limit_mcp', metadata: { tool: name, client: env.client.slice(0, 100) } })
    if (error) console.error(`[mcp ${name}] limit log failed:`, error)
    return { content: [{ type: 'text', text: limit.message }], isError: true }
  }

  let ok = true
  try {
    const result = await fn(env)
    if (result.isError) ok = false
    return result
  } catch (e) {
    ok = false
    if (e instanceof ToolError) return { content: [{ type: 'text', text: e.message }], isError: true }
    console.error(`[mcp ${name}]`, e)
    return { content: [{ type: 'text', text: 'Something went wrong on ModuleHire. Try again in a moment.' }], isError: true }
  } finally {
    const { error } = await env.supabase
      .from('usage_events')
      .insert({ user_id: env.userId, action: `ev_mcp_${name}`, metadata: { client: env.client.slice(0, 100), ok, ms: Date.now() - started } })
    if (error) console.error(`[mcp ${name}] usage log failed:`, error)
  }
}
