import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { waitForConversation } from '@/lib/voice/elevenlabs'
import { buildSessionContext, isInterviewType, scoreInterview } from '@/lib/voice/interview'

export const maxDuration = 120

type RouteContext = { params: Promise<{ id: string }> }

// POST { conversation_id } — called by the browser after hang-up. Pulls the transcript from
// ElevenLabs (we never store audio), saves it, and scores it. Safe to call again on a session
// that failed scoring; a scored session just returns its feedback.
export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: session } = await supabase
    .from('interview_sessions')
    .select('id, user_id, job_description_id, interview_type, length_minutes, status, el_conversation_id, feedback, transcript')
    .eq('id', id)
    .single()
  if (!session || session.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.status === 'scored') return NextResponse.json({ status: 'scored', feedback: session.feedback })

  const body = await req.json().catch(() => ({}))
  const conversationId: string | null = session.el_conversation_id ?? (typeof body?.conversation_id === 'string' ? body.conversation_id : null)
  if (!conversationId || !/^[A-Za-z0-9_-]{6,80}$/.test(conversationId)) {
    return NextResponse.json({ error: 'Missing conversation_id' }, { status: 400 })
  }

  const admin = await createAdminClient()
  try {
    const conv = await waitForConversation(conversationId)
    // Only accept conversations with our own agent, and never one already linked elsewhere.
    if (conv.agent_id !== process.env.ELEVENLABS_AGENT_ID) {
      return NextResponse.json({ error: 'Conversation does not belong to this app' }, { status: 400 })
    }
    if (!session.el_conversation_id) {
      const { count } = await admin
        .from('interview_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('el_conversation_id', conversationId)
      if ((count ?? 0) > 0) return NextResponse.json({ error: 'Conversation already used' }, { status: 409 })
    }

    const transcript = (conv.transcript ?? []).map((t) => ({
      role: t.role,
      message: t.message ?? '',
      time_in_call_secs: t.time_in_call_secs,
    }))
    const duration = conv.metadata?.call_duration_secs ?? null
    await admin
      .from('interview_sessions')
      .update({ el_conversation_id: conversationId, status: 'ended', transcript, duration_s: duration, ended_at: new Date().toISOString() })
      .eq('id', id)

    await admin.from('usage_events').insert({
      user_id: user.id,
      action: 'ev_voice_session_end',
      metadata: { session_id: id, duration_s: duration, type: session.interview_type },
    })

    if (!isInterviewType(session.interview_type) || !session.job_description_id) {
      return NextResponse.json({ status: 'ended', feedback: null })
    }
    const ctx = await buildSessionContext(supabase, user.id, session.job_description_id, session.interview_type, session.length_minutes)
    const started = Date.now()
    const feedback = await scoreInterview(user.id, transcript, ctx, session.interview_type)
    await admin.from('usage_events').insert({
      user_id: user.id,
      action: 'ev_voice_feedback',
      metadata: { session_id: id, ok: !!feedback, ms: Date.now() - started },
    })
    if (!feedback) {
      return NextResponse.json({ status: 'ended', feedback: null, note: 'Too short to score. Answer at least two questions next time.' })
    }
    await admin.from('interview_sessions').update({ status: 'scored', feedback }).eq('id', id)
    return NextResponse.json({ status: 'scored', feedback })
  } catch (error) {
    console.error('[interview/voice finish]', error)
    await admin.from('interview_sessions').update({ status: 'failed', el_conversation_id: conversationId }).eq('id', id).neq('status', 'scored')
    return NextResponse.json({ error: 'Could not score this interview. Try again in a minute.' }, { status: 500 })
  }
}
