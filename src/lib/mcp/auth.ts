// Auth for the MCP endpoint. Every MCP request carries a Supabase access token as a bearer
// token (issued by Supabase Auth's OAuth 2.1 server once that is enabled; a normal session
// access token works the same way for local testing). Tools run as that user through a
// user-scoped client, so RLS applies exactly as it does for the web app.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AuthInfo } from '@modelcontextprotocol/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy'

/** Issuer of Supabase Auth, listed as our authorization server in the protected resource metadata. */
export const AUTH_SERVER_URL = `${SUPABASE_URL}/auth/v1`

export type McpUser = { userId: string; email: string | null; client: string }

export function userClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Reads a claim from the JWT payload without verifying it. Only used for labelling (which OAuth
// client is calling, for usage stats); identity always comes from auth.getUser() below.
function unverifiedClaim(token: string, claim: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
    const v = payload?.[claim]
    return typeof v === 'string' ? v : null
  } catch {
    return null
  }
}

export async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined
  const { data, error } = await userClient(bearerToken).auth.getUser(bearerToken)
  if (error || !data.user) return undefined
  const client = unverifiedClaim(bearerToken, 'client_id') ?? 'session'
  const exp = Number(unverifiedClaim(bearerToken, 'exp') ?? NaN)
  return {
    token: bearerToken,
    clientId: client,
    scopes: [],
    ...(Number.isFinite(exp) ? { expiresAt: exp } : {}),
    extra: { userId: data.user.id, email: data.user.email ?? null } satisfies Omit<McpUser, 'client'>,
  }
}

/** The verified user behind a tool call. Throws if the request somehow reached a tool unauthenticated. */
export function mcpUser(authInfo: AuthInfo | undefined): McpUser & { supabase: SupabaseClient; token: string } {
  const extra = authInfo?.extra as { userId?: string; email?: string | null } | undefined
  if (!authInfo || !extra?.userId) throw new Error('Not signed in to ModuleHire.')
  return { userId: extra.userId, email: extra.email ?? null, client: authInfo.clientId, supabase: userClient(authInfo.token), token: authInfo.token }
}
