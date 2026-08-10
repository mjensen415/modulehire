/**
 * App-level email verification (P1.2).
 *
 * Why app-level and not Supabase's native "Confirm email":
 * The product wants unverified users to be able to log in and browse (build
 * their library) but NOT run the paid generation. Supabase's native flow blocks
 * login entirely until confirmed, which is the wrong UX. So we:
 *   1. create the user UNCONFIRMED via admin.generateLink (they can still log in
 *      as long as the Supabase project's "Confirm email" setting is OFF),
 *   2. email the confirmation link ourselves (Brevo),
 *   3. gate only the expensive action (generate-resume) on email_confirmed_at.
 *
 * The whole behavior is inert unless REQUIRE_EMAIL_VERIFICATION === 'true', so
 * it can be deployed dormant and switched on once Brevo sender + Supabase
 * settings are configured. Existing (already-confirmed) users are unaffected.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

export function isVerificationRequired(): boolean {
  return process.env.REQUIRE_EMAIL_VERIFICATION === 'true'
}

/** True when this user still needs to verify their email before paid actions. */
export function needsEmailVerification(user: Pick<User, 'email_confirmed_at'> | null): boolean {
  if (!isVerificationRequired()) return false
  if (!user) return true
  return !user.email_confirmed_at
}

function verificationEmailHtml(actionLink: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
    <h1 style="font-size:20px;margin:0 0 12px">Confirm your email</h1>
    <p style="font-size:15px;line-height:1.5;margin:0 0 20px">
      Welcome to ModuleHire. Confirm your email to unlock resume generation.
      You can keep exploring and building your library in the meantime.
    </p>
    <p style="margin:0 0 24px">
      <a href="${actionLink}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px">
        Confirm email
      </a>
    </p>
    <p style="font-size:13px;color:#666;line-height:1.5;margin:0">
      If the button doesn't work, paste this link into your browser:<br>
      <span style="word-break:break-all">${actionLink}</span>
    </p>
  </div>`
}

/**
 * Create an unconfirmed user AND send them a confirmation email.
 * Returns the created user id on success. On email-send failure the user is
 * still created (they can request a resend), but we surface the error for logs.
 */
export async function createUnconfirmedUserAndSendVerification(
  admin: SupabaseClient,
  params: { email: string; password: string; redirectTo: string },
): Promise<
  | { ok: true; userId: string | undefined; emailSent: boolean; emailError?: string }
  | { ok: false; duplicate: boolean; error: string }
> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup',
    email: params.email,
    password: params.password,
    options: { redirectTo: params.redirectTo },
  })

  if (error) {
    const duplicate =
      error.code === 'email_exists' ||
      error.status === 422 ||
      /already.*registered/i.test(error.message)
    return { ok: false, duplicate, error: error.message }
  }

  const actionLink = data.properties?.action_link
  const userId = data.user?.id

  if (!actionLink) {
    return { ok: true, userId, emailSent: false, emailError: 'no action_link returned' }
  }

  const sent = await sendEmail({
    to: params.email,
    subject: 'Confirm your email — ModuleHire',
    html: verificationEmailHtml(actionLink),
    text: `Confirm your email to unlock resume generation: ${actionLink}`,
  })

  return {
    ok: true,
    userId,
    emailSent: sent.ok,
    emailError: sent.ok ? undefined : sent.reason,
  }
}
