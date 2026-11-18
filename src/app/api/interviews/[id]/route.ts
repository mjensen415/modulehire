import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { interviewFields } from '@/lib/interviews'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = interviewFields(body, true)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (body?.prep_opened === true) parsed.fields.prep_opened_at = new Date().toISOString()
  if (Object.keys(parsed.fields).length === 0) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
  const { data, error } = await supabase.from('interviews').update(parsed.fields).eq('id', id).eq('user_id', user.id).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { error } = await supabase.from('interviews').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Could not delete.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
