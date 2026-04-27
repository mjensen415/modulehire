import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requiredString, optionalString, ValidationError } from '@/lib/validate'

const VALID_EMP_TYPES = new Set(['full-time', 'consulting', 'contract', 'board', 'volunteer'])

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('job_experiences')
      .select('*')
      .eq('user_id', user.id)
      .order('start_date', { ascending: false, nullsFirst: false })

    if (error) throw error
    return NextResponse.json({ jobs: data ?? [] })
  } catch (e) {
    console.error('[job-experiences GET]', e)
    return NextResponse.json({ error: 'Could not load jobs.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()

    let row
    try {
      row = {
        user_id: user.id,
        company: requiredString(body.company, 200, 'company'),
        title: optionalString(body.title, 200, 'title'),
        start_date: optionalString(body.start_date, 20, 'start_date'),
        end_date: optionalString(body.end_date, 20, 'end_date'),
        location: optionalString(body.location, 200, 'location'),
        employment_type: VALID_EMP_TYPES.has(body.employment_type) ? body.employment_type : null,
      }
    } catch (e) {
      if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
      throw e
    }

    const { data, error } = await supabase.from('job_experiences').insert(row).select().single()

    if (error) {
      console.error('[job-experiences POST]', error)
      return NextResponse.json({ error: 'Could not save job.' }, { status: 500 })
    }
    return NextResponse.json({ job: data })
  } catch (e) {
    console.error('[job-experiences POST]', e)
    return NextResponse.json({ error: 'Could not save job.' }, { status: 500 })
  }
}
