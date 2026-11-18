import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { interviewFields } from '@/lib/interviews'

const SELECT = 'id, job_application_id, round_name, scheduled_at, format, interviewers, notes, prep_opened_at, created_at, job_applications(id, company, title, status, job_description_id)'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('interviews').select(SELECT).eq('user_id', user.id).order('scheduled_at', { ascending: true, nullsFirst: false })
  if (error) {
    console.error('[interviews GET]', error)
    return NextResponse.json({ error: 'Could not load interviews.' }, { status: 500 })
  }
  return NextResponse.json({ interviews: data ?? [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const parsed = interviewFields(body, false)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const sourceDoc = isUuid(body?.source_document_id) ? body.source_document_id : null
  const { data, error } = await supabase
    .from('interviews')
    .insert({ ...parsed.fields, user_id: user.id, source_document_id: sourceDoc })
    .select(SELECT)
    .single()
  if (error) {
    console.error('[interviews POST]', error)
    return NextResponse.json({ error: 'Could not save the interview.' }, { status: 500 })
  }
  return NextResponse.json({ interview: data }, { status: 201 })
}
