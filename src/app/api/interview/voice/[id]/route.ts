import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { deleteConversation } from '@/lib/voice/elevenlabs'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('interview_sessions')
    .select('id, job_description_id, interview_type, length_minutes, status, duration_s, transcript, feedback, created_at')
    .eq('id', id)
    .single()
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

// DELETE — removes our row and the conversation on ElevenLabs' side.
export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: row } = await supabase.from('interview_sessions').select('id, el_conversation_id').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (row.el_conversation_id) {
    try {
      await deleteConversation(row.el_conversation_id)
    } catch (e) {
      // Still delete ours; ElevenLabs' retention setting removes theirs on schedule.
      console.error('[interview/voice DELETE] ElevenLabs delete failed', e)
    }
  }
  const { error } = await supabase.from('interview_sessions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not delete' }, { status: 500 })
  return NextResponse.json({ success: true })
}
