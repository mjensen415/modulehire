import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkAndLog } from '@/lib/rate-limit'
import { extractInterviewFromEmail } from '@/lib/interviews'
import { normalizeCompany } from '@/lib/resume-dates'

export const maxDuration = 60

// Paste an interview email → the round's details for the user to confirm. The email is kept as a
// documents row (kind interview_email); nothing is saved as an interview until the user confirms
// (POST /api/interviews with source_document_id).
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const email = typeof body?.email_text === 'string' ? body.email_text.trim() : ''
  if (email.length < 40) return NextResponse.json({ error: 'Paste the whole interview email.' }, { status: 400 })
  if (email.length > 30_000) return NextResponse.json({ error: 'That email is too long. Paste just the scheduling message.' }, { status: 400 })

  const limit = await checkAndLog(supabase, user.id, 'rl_interview_email', 30, 3600)
  if (!limit.ok) return NextResponse.json({ error: 'Too many emails in the last hour. Try again later.' }, { status: 429 })

  try {
    const extract = await extractInterviewFromEmail(email, user.id)
    const admin = await createAdminClient()
    const { data: doc } = await admin
      .from('documents')
      .insert({
        user_id: user.id,
        kind: 'interview_email',
        filename: `${extract.round_name}${extract.company ? ` · ${extract.company}` : ''} (email)`.slice(0, 200),
        raw_text: email,
      })
      .select('id')
      .single()

    // The tracked job this is probably for: same normalized company, most recent first.
    let suggestedApp: string | null = null
    if (extract.company) {
      const { data: apps } = await supabase.from('job_applications').select('id, company').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(200)
      const want = normalizeCompany(extract.company)
      suggestedApp = (apps ?? []).find(a => normalizeCompany(a.company) === want)?.id
        ?? (apps ?? []).find(a => { const c = normalizeCompany(a.company); return !!c && (c.includes(want) || want.includes(c)) })?.id
        ?? null
    }
    return NextResponse.json({ extract, source_document_id: doc?.id ?? null, suggested_job_application_id: suggestedApp })
  } catch (error) {
    console.error('[interviews/from-email]', error)
    return NextResponse.json({ error: 'We could not read that email. Add the round by hand instead.' }, { status: 500 })
  }
}
