import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import fs from 'fs'
import path from 'path'

// ─── Brevo transactional email ───────────────────────────────────────────────
async function sendBrevoEmail(to: string, subject: string, htmlContent: string) {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) throw new Error('BREVO_API_KEY is not set')

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'ModuleHire', email: 'hello@modulehire.com' },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Brevo error ${res.status}: ${body}`)
  }

  return res.json()
}

// ─── Load and render the invite email template ────────────────────────────────
function renderInviteEmail(code: string): string {
  try {
    const templatePath = path.join(process.cwd(), 'email-templates', 'authentication', 'beta-invite.html')
    const html = fs.readFileSync(templatePath, 'utf-8')
    return html.replace(/\{\{BETA_CODE\}\}/g, code)
  } catch {
    // Fallback inline template if file read fails (e.g. Vercel serverless)
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Your ModuleHire beta invite is here</title></head>
<body style="margin:0;padding:0;background:#f5f7fc;font-family:system-ui,sans-serif;">
<table width="100%" cellspacing="0" cellpadding="0">
  <tr><td align="center" style="padding:40px 16px;">
    <table width="100%" style="max-width:560px;">
      <tr><td style="background:#fff;border-radius:12px;border:1px solid #e6e9f4;padding:40px;">
        <h1 style="color:#0d1224;font-size:22px;">You&rsquo;re in. Welcome to the beta.</h1>
        <p style="color:#3d4663;">Your beta code:</p>
        <div style="background:#0d1224;border-radius:10px;padding:22px;text-align:center;">
          <div style="font-size:32px;font-weight:700;color:#1d9e75;letter-spacing:6px;font-family:monospace;">${code}</div>
        </div>
        <p style="color:#3d4663;margin-top:24px;">Go to <a href="https://modulehire.com/signin" style="color:#1d9e75;">modulehire.com/signin</a>, enter your code to unlock signup, upload your resume and start building.</p>
        <p style="color:#7a82a0;font-size:13px;">Have feedback? Use the widget in the bottom left corner of any page.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { request_id, code: specifiedCode, resend = false } = await req.json()
  if (!request_id) return NextResponse.json({ error: 'request_id required' }, { status: 400 })

  const adminClient = await createAdminClient()

  // Load the beta request
  const { data: betaRequest, error: reqErr } = await adminClient
    .from('beta_requests')
    .select('id, email, status, beta_code')
    .eq('id', request_id)
    .single()

  if (reqErr || !betaRequest) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (betaRequest.status === 'invited' && !resend) return NextResponse.json({ error: 'Already invited' }, { status: 409 })

  // On resend: deactivate the old code if it hasn't been used yet
  if (resend && betaRequest.beta_code) {
    await adminClient
      .from('beta_codes')
      .update({ is_active: false })
      .eq('code', betaRequest.beta_code)
      .is('used_at', null)
  }

  // Resolve the beta code to use
  let code: string

  if (specifiedCode) {
    // Verify the specified code is available
    const { data: codeRow } = await adminClient
      .from('beta_codes')
      .select('code')
      .eq('code', specifiedCode)
      .eq('is_active', true)
      .is('used_at', null)
      .single()

    if (!codeRow) return NextResponse.json({ error: 'Code not available' }, { status: 400 })
    code = codeRow.code
  } else {
    // Auto-pick the most recently created unsent, unused code
    const { data: availableCode } = await adminClient
      .from('beta_codes')
      .select('code')
      .eq('is_active', true)
      .is('used_at', null)
      .is('sent_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!availableCode) return NextResponse.json({ error: 'No available beta codes. Generate more first.' }, { status: 400 })
    code = availableCode.code
  }

  // Send the email
  const html = renderInviteEmail(code)
  try {
    await sendBrevoEmail(
      betaRequest.email,
      'Your ModuleHire beta invite is here',
      html,
    )
  } catch (emailErr) {
    console.error('[send-beta-invite] Email send failed:', emailErr)
    return NextResponse.json({ error: (emailErr as Error).message }, { status: 500 })
  }

  const now = new Date().toISOString()

  // Mark the code as sent so it won't be auto-assigned to anyone else
  await adminClient
    .from('beta_codes')
    .update({ sent_at: now, sent_to_email: betaRequest.email })
    .eq('code', code)

  // Mark request as invited
  await adminClient
    .from('beta_requests')
    .update({ status: 'invited', beta_code: code, invited_at: now })
    .eq('id', request_id)

  return NextResponse.json({ success: true, code })
}
