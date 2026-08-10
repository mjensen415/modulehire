import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkAndLogKey } from '@/lib/rate-limit'
import { sendEmail } from '@/lib/email'
import { isVerificationRequired, needsEmailVerification } from '@/lib/email-verification'

// Resends the signup confirmation email for the currently signed-in, still
// unverified user. Requires an authenticated session (unverified users can log
// in and browse under this app's model), so it can't be used to spam arbitrary
// addresses. Rate-limited per user.
export async function POST(req: Request) {
  if (!isVerificationRequired()) {
    return NextResponse.json({ success: true })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Already verified — nothing to do.
  if (!needsEmailVerification(user)) return NextResponse.json({ success: true })

  const admin = await createAdminClient()
  const limited = await checkAndLogKey(admin, user.id, 'rl_resend_verification', 3, 3600)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } },
    )
  }

  // Use a magic link for the resend: the user already exists (unconfirmed), and
  // completing a magic link proves email ownership, which sets email_confirmed_at
  // and clears the verification gate. (type:'signup' requires the password, which
  // we don't hold here.)
  const { origin } = new URL(req.url)
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email!,
    options: { redirectTo: `${origin}/auth/callback?next=/dashboard` },
  })

  if (error || !data.properties?.action_link) {
    console.error('[resend-verification] generateLink failed:', error?.message)
    return NextResponse.json({ error: 'Could not send email.' }, { status: 500 })
  }

  const sent = await sendEmail({
    to: user.email!,
    subject: 'Confirm your email — ModuleHire',
    html: `<p>Confirm your email to unlock resume generation:</p><p><a href="${data.properties.action_link}">Confirm email</a></p>`,
    text: `Confirm your email: ${data.properties.action_link}`,
  })

  if (!sent.ok) {
    console.error('[resend-verification] send failed:', sent.reason)
    return NextResponse.json({ error: 'Could not send email.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
