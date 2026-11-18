import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sprintRequired } from '@/lib/entitlements'
import { isUuid } from '@/lib/validate'
import { getInterviewPrep, InterviewPrepError } from '@/lib/interview-prep'

export const maxDuration = 120

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const gate = await sprintRequired(supabase, user.id)
    if (gate) return NextResponse.json({ ...gate, error: 'pro_required', message: gate.error }, { status: 403 })

    const body = await req.json()
    const jobDescriptionId = body?.job_description_id
    if (!isUuid(jobDescriptionId)) {
      return NextResponse.json({ error: 'Invalid job_description_id' }, { status: 400 })
    }
    try {
      const result = await getInterviewPrep(supabase, user.id, jobDescriptionId, { regenerate: !!body?.regenerate })
      return NextResponse.json(result)
    } catch (e) {
      if (e instanceof InterviewPrepError) {
        return NextResponse.json({ error: e.message }, { status: e.code === 'not_found' ? 404 : 400 })
      }
      throw e
    }
  } catch (error) {
    console.error('[interview-prep POST]', error)
    return NextResponse.json({ error: 'Could not generate interview prep.' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const jobDescriptionId = new URL(req.url).searchParams.get('job_description_id')
    if (!isUuid(jobDescriptionId)) return NextResponse.json({ error: 'Invalid job_description_id' }, { status: 400 })

    const { error } = await supabase
      .from('interview_prep_cache')
      .delete()
      .eq('user_id', user.id)
      .eq('job_description_id', jobDescriptionId)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[interview-prep DELETE]', error)
    return NextResponse.json({ error: 'Could not clear cache.' }, { status: 500 })
  }
}
