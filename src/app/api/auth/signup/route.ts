import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkAndLogKey } from '@/lib/rate-limit'
import { verifyTurnstile } from '@/lib/turnstile'
import { isVerificationRequired, createUnconfirmedUserAndSendVerification } from '@/lib/email-verification'

export async function POST(req: Request) {
  try {
    // ── Per-IP throttle (P1.3): 5 signups / hour, backed by the durable
    // rate_limits table so it survives serverless cold starts. Runs on the
    // service-role admin client since the caller isn't authenticated.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const supabase = await createAdminClient()
    const throttled = await checkAndLogKey(supabase, ip, 'rl_signup', 5, 3600)
    if (!throttled.ok) {
      return NextResponse.json(
        { error: 'Too many sign-up attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(throttled.retryAfter) } },
      )
    }

    const { email, password, turnstileToken } = await req.json()

    if (typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }
    if (password.length > 200) {
      return NextResponse.json({ error: 'Password is too long.' }, { status: 400 })
    }
    if (email.length > 320) {
      return NextResponse.json({ error: 'Email is too long.' }, { status: 400 })
    }

    // ── Bot check (P1.1). No-op until TURNSTILE_SECRET_KEY is set in the
    // environment; enforced once it is.
    const captcha = await verifyTurnstile(turnstileToken, ip)
    if (!captcha.ok) {
      return NextResponse.json({ error: captcha.reason }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // ── Email verification path (P1.2) ──────────────────────────────────────
    // When REQUIRE_EMAIL_VERIFICATION is on, create the user UNCONFIRMED and
    // email them a confirmation link (via Brevo). They can still log in and
    // browse; only the paid generate action is gated on confirmation. Requires
    // the Supabase project's "Confirm email" setting to be OFF so unconfirmed
    // users can sign in.
    if (isVerificationRequired()) {
      const { origin } = new URL(req.url)
      const result = await createUnconfirmedUserAndSendVerification(supabase, {
        email: normalizedEmail,
        password,
        redirectTo: `${origin}/auth/callback?next=/onboarding`,
      })
      if (!result.ok) {
        if (result.duplicate) {
          return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 400 })
        }
        console.error('[signup] generateLink failed:', result.error)
        return NextResponse.json({ error: 'Could not create account.' }, { status: 500 })
      }
      if (!result.emailSent) {
        // User exists but the email didn't go out — log loudly so it's visible.
        console.error('[signup] verification email NOT sent:', result.emailError)
      }
      return NextResponse.json({ success: true, userId: result.userId, verifyEmailSent: result.emailSent })
    }

    // ── Default path: auto-confirmed account (current behavior) ─────────────
    const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    })

    if (createError) {
      // Supabase signals a duplicate with code 'email_exists' (status 422) and the
      // message "A user with this email address has already been registered".
      // Match on the stable code/status — the old `includes('already registered')`
      // check broke because the message reads "already been registered".
      const isDuplicate =
        createError.code === 'email_exists' ||
        createError.status === 422 ||
        /already.*registered/i.test(createError.message)
      if (isDuplicate) {
        return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 400 })
      }
      console.error('[signup] createUser failed:', createError)
      return NextResponse.json({ error: 'Could not create account.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, userId: user?.id })
  } catch (error) {
    console.error('[signup]', error)
    return NextResponse.json({ error: 'Could not create account.' }, { status: 500 })
  }
}
