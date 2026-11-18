import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { hasActiveSprint, loadSprintUser } from '@/lib/entitlements'
import { isUuid } from '@/lib/validate'
import { getSignedUrl, voiceEnabled } from '@/lib/voice/elevenlabs'
import {
  buildSessionContext,
  isInterviewType,
  VoiceContextError,
  VOICE_CONSENT_VERSION,
  VOICE_MONTHLY_SESSIONS,
} from '@/lib/voice/interview'

function monthStart(): string {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
}

// Sessions started this month. Counted from usage_events, which users cannot delete
// (20261029_lock_usage_events.sql), so deleting a session never resets the cap.
async function monthlyCount(userId: string): Promise<number> {
  const admin = await createAdminClient()
  const { count } = await admin
    .from('usage_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', 'ev_voice_session_start')
    .gte('created_at', monthStart())
  return count ?? 0
}

// GET — status for the page (enabled, Pro, sessions left) plus the user's session history.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jdId = new URL(req.url).searchParams.get('jd_id')
  const sprint = hasActiveSprint(await loadSprintUser(supabase, user.id))

  let q = supabase
    .from('interview_sessions')
    .select('id, job_description_id, interview_type, length_minutes, status, duration_s, feedback, created_at')
    .order('created_at', { ascending: false })
    .limit(30)
  if (isUuid(jdId)) q = q.eq('job_description_id', jdId)
  const { data: sessions } = await q

  const used = await monthlyCount(user.id)
  return NextResponse.json({
    enabled: voiceEnabled(),
    is_pro: sprint, // Sprint access (paid Sprint, beta_pro, or legacy Pro in its paid period)
    monthly_limit: VOICE_MONTHLY_SESSIONS,
    used_this_month: used,
    consent_version: VOICE_CONSENT_VERSION,
    sessions: (sessions ?? []).map((s) => ({
      ...s,
      overall_score: (s.feedback as { overall_score?: number } | null)?.overall_score ?? null,
      feedback: undefined,
    })),
  })
}

// POST — start a session: checks Pro, the kill switch and the monthly cap, builds the context,
// records consent, and returns a signed URL plus the dynamic variables for the client SDK.
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!voiceEnabled()) {
      return NextResponse.json({ error: 'Voice interviews are paused right now. Try again later.' }, { status: 503 })
    }

    if (!hasActiveSprint(await loadSprintUser(supabase, user.id))) {
      return NextResponse.json({ error: 'pro_required' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const jdId = body?.job_description_id
    const type = body?.interview_type
    const length = Number(body?.length_minutes)
    if (!isUuid(jdId)) return NextResponse.json({ error: 'Invalid job_description_id' }, { status: 400 })
    if (!isInterviewType(type)) return NextResponse.json({ error: 'Invalid interview_type' }, { status: 400 })
    if (length !== 10 && length !== 20) return NextResponse.json({ error: 'length_minutes must be 10 or 20' }, { status: 400 })
    if (body?.consent !== true || body?.consent_version !== VOICE_CONSENT_VERSION) {
      return NextResponse.json({ error: 'consent_required' }, { status: 400 })
    }

    if ((await monthlyCount(user.id)) >= VOICE_MONTHLY_SESSIONS) {
      return NextResponse.json(
        { error: `You've used all ${VOICE_MONTHLY_SESSIONS} voice interviews for this month. They reset on the 1st.` },
        { status: 429 },
      )
    }

    let ctx
    try {
      ctx = await buildSessionContext(supabase, user.id, jdId, type, length)
    } catch (e) {
      if (e instanceof VoiceContextError) {
        return NextResponse.json({ error: e.message }, { status: e.code === 'not_found' ? 404 : 400 })
      }
      throw e
    }

    const signedUrl = await getSignedUrl()
    const admin = await createAdminClient()
    const now = new Date().toISOString()
    const { data: row, error } = await admin
      .from('interview_sessions')
      .insert({
        user_id: user.id,
        job_description_id: jdId,
        interview_type: type,
        length_minutes: length,
        status: 'created',
        consent_version: VOICE_CONSENT_VERSION,
        consented_at: now,
      })
      .select('id')
      .single()
    if (error || !row) throw error ?? new Error('insert failed')

    await admin.from('usage_events').insert({
      user_id: user.id,
      action: 'ev_voice_session_start',
      metadata: { session_id: row.id, type, length },
    })

    return NextResponse.json({
      session_id: row.id,
      signed_url: signedUrl,
      dynamic_variables: ctx.dynamicVariables,
      job_title: ctx.jobTitle,
      company: ctx.company,
      max_seconds: length * 60,
    })
  } catch (error) {
    console.error('[interview/voice POST]', error)
    return NextResponse.json({ error: 'Could not start the interview.' }, { status: 500 })
  }
}
