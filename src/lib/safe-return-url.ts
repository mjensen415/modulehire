/**
 * Returns an absolute URL that's safe to hand to Stripe / OAuth as a return target.
 * Only accepts:
 *   - relative paths starting with "/"  (joined onto the request origin)
 *   - absolute URLs that share the request's origin
 * Anything else falls back to `${origin}${fallbackPath}`.
 */
export function safeReturnUrl(req: Request, raw: unknown, fallbackPath = '/dashboard'): string {
  const host = req.headers.get('host')
  const origin =
    req.headers.get('origin')
    ?? (host ? `https://${host}` : '')

  const fallback = `${origin}${fallbackPath}`

  if (typeof raw !== 'string' || !raw) return fallback

  // Relative path
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    return `${origin}${raw}`
  }

  try {
    const u = new URL(raw)
    if (origin) {
      const o = new URL(origin)
      if (u.origin === o.origin) return u.toString()
    }
  } catch {
    // fall through
  }

  return fallback
}
