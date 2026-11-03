import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Resolve the user from the session cookie, falling back to a Bearer token (the pattern
// my-resumes, analyze-jd, match-modules and generate-resume use inline). The cookie always wins,
// so web requests behave exactly as before; the bearer path is for the MCP server's in-process
// calls into /api/jobs/start and the handlers it calls.
export async function resolveAuth(req: Request): Promise<{ user: User | null; supabase: SupabaseClient }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) return { user, supabase }

  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const authedClient = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data } = await authedClient.auth.getUser(token)
    if (data.user) return { user: data.user, supabase: authedClient }
  }
  return { user: null, supabase }
}

/** The request's bearer header, to forward on in-process calls (empty when there is none). */
export function bearerHeader(req: Request): Record<string, string> {
  const auth = req.headers.get('authorization')
  return auth?.startsWith('Bearer ') ? { Authorization: auth } : {}
}
