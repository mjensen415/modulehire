import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requiredString, optionalString } from '@/lib/validate'
import { ensureJobDescription } from '@/lib/job-descriptions'

const STATUSES = new Set(['saved', 'applied', 'screening', 'interviewing', 'offered', 'rejected', 'withdrawn'])

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('job_applications')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    if (error) throw error

    return NextResponse.json({ applications: data ?? [] })
  } catch (error) {
    console.error('[job-tracker GET]', error)
    return NextResponse.json({ error: 'Could not load applications.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const company = requiredString(body.company, 200, 'company')
    const title = requiredString(body.title, 200, 'title')
    const url = optionalString(body.url, 2000, 'url')
    const jdText = optionalString(body.jd_text, 50_000, 'jd_text')
    const notes = optionalString(body.notes, 5000, 'notes')
    const status = typeof body.status === 'string' && STATUSES.has(body.status) ? body.status : 'saved'
    const appliedAt = typeof body.applied_at === 'string' && body.applied_at ? body.applied_at : null

    const jobDescriptionId = jdText ? await ensureJobDescription(supabase, user.id, jdText) : null

    const { data, error } = await supabase
      .from('job_applications')
      .insert({
        user_id: user.id,
        company,
        title,
        url,
        jd_text: jdText,
        notes,
        status,
        applied_at: appliedAt,
        job_description_id: jobDescriptionId,
      })
      .select()
      .single()
    if (error) throw error

    return NextResponse.json({ application: data })
  } catch (error) {
    if (error instanceof Error && error.name === 'ValidationError') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[job-tracker POST]', error)
    return NextResponse.json({ error: 'Could not create application.' }, { status: 500 })
  }
}
