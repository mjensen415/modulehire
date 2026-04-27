import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

const ALLOWED_FIELDS = ['title', 'content', 'weight', 'type', 'source_company', 'source_role_title', 'date_start', 'date_end', 'employment_type', 'themes', 'role_types', 'company_stage']

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { data, error } = await supabase
      .from('modules')
      .select('id, title, content, weight, themes, type, source_company, source_role_title, date_start, date_end')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ module: data })
  } catch (error) {
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await req.json()

    const updates: Record<string, unknown> = {}
    for (const key of ALLOWED_FIELDS) {
      if (key in body) updates[key] = body[key]
    }

    const { data, error } = await supabase
      .from('modules')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ module: data })
  } catch (error) {
    console.error('[[id]/route.ts]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    const { error } = await supabase
      .from('modules')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[[id]/route.ts]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
