/**
 * Cloudflare Turnstile server-side verification.
 *
 * Set two env vars:
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY  — rendered in the signup widget (public)
 *   TURNSTILE_SECRET_KEY            — used here to verify tokens (server-only)
 *
 * Get both from the Cloudflare dashboard → Turnstile → add a site.
 *
 * Fail-safe posture: if TURNSTILE_SECRET_KEY is NOT set, verification is
 * skipped (returns ok) so local/dev and un-provisioned environments don't
 * block signup. Once the secret is set in prod, tokens are enforced.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export type TurnstileResult = { ok: true } | { ok: false; reason: string }

export async function verifyTurnstile(
  token: unknown,
  ip?: string | null,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  // Not configured — skip (dev / not yet provisioned). Enforced once secret set.
  if (!secret) return { ok: true }

  if (typeof token !== 'string' || !token) {
    return { ok: false, reason: 'Captcha missing. Please complete the challenge.' }
  }

  const body = new URLSearchParams()
  body.set('secret', secret)
  body.set('response', token)
  if (ip) body.set('remoteip', ip)

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    const data = (await res.json()) as { success?: boolean }
    if (data.success) return { ok: true }
    return { ok: false, reason: 'Captcha verification failed. Please try again.' }
  } catch {
    // Network/timeout talking to Cloudflare. Fail CLOSED on signup — a bot
    // shouldn't get through just because the verifier is unreachable.
    return { ok: false, reason: 'Could not verify captcha. Please try again.' }
  }
}
