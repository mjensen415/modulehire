import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-guard'

const LAB_TYPES = new Set(['jd_parse', 'match_modules', 'module_rewrite'])

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const { user } = guard

  try {
    const { lab_type, input_snapshot, output_snapshot, feedback, notes } = await req.json()
    if (!LAB_TYPES.has(lab_type)) {
      return NextResponse.json({ error: 'Invalid lab_type' }, { status: 400 })
    }
    if (typeof input_snapshot !== 'object' || input_snapshot === null) {
      return NextResponse.json({ error: 'Missing input_snapshot' }, { status: 400 })
    }
    if (typeof output_snapshot !== 'object' || output_snapshot === null) {
      return NextResponse.json({ error: 'Missing output_snapshot' }, { status: 400 })
    }

    const adminClient = await createAdminClient()
    const { data, error } = await adminClient
      .from('prompt_feedback')
      .insert({
        user_id: user.id,
        lab_type,
        input_snapshot,
        output_snapshot,
        feedback: feedback ?? {},
        notes: typeof notes === 'string' ? notes : null,
      })
      .select()
      .single()
    if (error) throw error

    return NextResponse.json({ feedback: data })
  } catch (error) {
    console.error('[admin/prompt-lab/feedback POST]', error)
    return NextResponse.json({ error: 'Could not save feedback.' }, { status: 500 })
  }
}

export async function GET() {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error

  try {
    const adminClient = await createAdminClient()
    const { data, error } = await adminClient
      .from('prompt_feedback')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error

    return NextResponse.json({ feedback: data ?? [] })
  } catch (error) {
    console.error('[admin/prompt-lab/feedback GET]', error)
    return NextResponse.json({ error: 'Could not load feedback.' }, { status: 500 })
  }
}
