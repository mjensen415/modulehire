import type { SupabaseClient } from '@supabase/supabase-js'

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number }

/**
 * Simple per-user rate limit backed by the existing usage_events table.
 * Counts how many `action` events this user has logged in the last `windowSeconds`.
 * Not strictly atomic — a small race window exists between count + insert — but
 * good enough to cap blast radius on AI-cost endpoints.
 *
 * Caller should: await checkAndLog(...) BEFORE doing expensive work, return 429 if !ok.
 */
export async function checkAndLog(
  supabase: SupabaseClient,
  userId: string,
  action: string,
  max: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString()

  const { count, error } = await supabase
    .from('usage_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('created_at', cutoff)

  if (error) {
    // Fail-open on infra error — don't block legit users if the limiter breaks
    console.error('[rate-limit] count failed:', error)
    return { ok: true }
  }

  if ((count ?? 0) >= max) {
    return { ok: false, retryAfter: windowSeconds }
  }

  // Insert event up-front so concurrent requests are constrained too
  await supabase.from('usage_events').insert({ user_id: userId, action })
  return { ok: true }
}
