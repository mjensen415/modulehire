import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkAndLogKey } from '@/lib/rate-limit'

// Sends a password-reset email. Always returns { success: true } regardless of
// whether the account exists, so the endpoint can't be used to enumerate accounts.
export async function POST(req: Request) {
  // Durable per-IP throttle: 5 requests / hour, backed by the rate_limits table
  // (survives serverless cold starts). The user isn't authenticated here, so this
  // runs on the service-role admin client.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const admin = await createAdminClient()
  const limited = await checkAndLogKey(admin, ip, 'rl_forgot_password', 5, 3600)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } },
    )
  }

  let email: unknown
  try {
    ;({ email } = await req.json())
  } catch {
    // Malformed body — respond success-shaped to avoid leaking anything.
    return NextResponse.json({ success: true })
  }

  if (typeof email === 'string' && email.includes('@') && email.length <= 320) {
    const normalized = email.toLowerCase().trim()
    const { origin } = new URL(req.url)
    const supabase = await createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
      redirectTo: `${origin}/auth/reset`,
    })
    // Log server-side but never surface to the caller — avoids account enumeration.
    if (error) console.error('[forgot-password] resetPasswordForEmail failed:', error.message)
  }

  return NextResponse.json({ success: true })
}
