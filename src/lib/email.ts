/**
 * Transactional email via Brevo's SMTP API.
 *
 * Brevo is already used for contact sync (scripts/sync-brevo-contacts.ts); this
 * adds one-off transactional sends (e.g. signup verification).
 *
 * Required env:
 *   BREVO_API_KEY   — same key used for contact sync
 *   EMAIL_FROM      — a sender address VERIFIED in Brevo (e.g. hello@modulehire.com)
 *   EMAIL_FROM_NAME — optional display name (defaults to "ModuleHire")
 *
 * The sender MUST be a verified sender/domain in Brevo or sends will fail.
 */

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

export type SendResult = { ok: true } | { ok: false; reason: string }

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<SendResult> {
  const apiKey = process.env.BREVO_API_KEY
  const from = process.env.EMAIL_FROM
  const fromName = process.env.EMAIL_FROM_NAME || 'ModuleHire'

  if (!apiKey) return { ok: false, reason: 'BREVO_API_KEY not configured' }
  if (!from) return { ok: false, reason: 'EMAIL_FROM not configured' }

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: from, name: fromName },
        to: [{ email: opts.to }],
        subject: opts.subject,
        htmlContent: opts.html,
        ...(opts.text ? { textContent: opts.text } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, reason: `Brevo ${res.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: (err as Error).message }
  }
}
