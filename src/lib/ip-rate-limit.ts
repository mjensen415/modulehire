// Lightweight in-memory per-key (IP) rate limiter. Best-effort only — state lives
// in a single server instance's memory and resets on cold start, so it won't
// perfectly throttle across a horizontally-scaled deploy. That's acceptable for
// capping abuse on unauthenticated endpoints like password-reset requests.

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number }

export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now()

  // Opportunistically sweep expired buckets so the map doesn't grow unbounded.
  if (buckets.size > 500) {
    for (const [k, b] of buckets) {
      if (now >= b.resetAt) buckets.delete(k)
    }
  }

  const existing = buckets.get(key)
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }

  if (existing.count >= max) {
    return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) }
  }

  existing.count += 1
  return { ok: true }
}
