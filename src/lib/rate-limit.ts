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

/**
 * TODO: wire this into src/app/api/auth/forgot-password/route.ts when that
 * feature is committed. The `rate_limits` table is already live in prod, but
 * this helper currently has no committed caller — the forgot-password wiring is
 * staged separately and should land in the same commit as that feature.
 *
 * Same count→insert→fail-open pattern as checkAndLog, but backed by the
 * text-keyed `rate_limits` table instead of usage_events. Use this for
 * unauthenticated endpoints where the subject is an arbitrary string (e.g. an
 * IP), which can't be stored in usage_events.user_id (uuid, FK to users).
 *
 * Requires a service-role client — `rate_limits` has RLS enabled with no policies.
 */
export async function checkAndLogKey(
  supabase: SupabaseClient,
  key: string,
  action: string,
  max: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString()

  const { count, error } = await supabase
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('key', key)
    .eq('action', action)
    .gte('created_at', cutoff)

  if (error) {
    // Fail-open on infra error — don't block legit users if the limiter breaks
    console.error('[rate-limit] key count failed:', error)
    return { ok: true }
  }

  if ((count ?? 0) >= max) {
    return { ok: false, retryAfter: windowSeconds }
  }

  await supabase.from('rate_limits').insert({ key, action })
  return { ok: true }
}
