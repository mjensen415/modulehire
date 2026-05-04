import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    const { data, error } = await supabase
      .from('job_descriptions')
      .select('id, raw_text, extracted_company, extracted_role_type, extracted_job_title, extracted_themes, extracted_phrases, extracted_seniority')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      jd: {
        jd_id: data.id,
        extracted_company: data.extracted_company,
        extracted_role_type: data.extracted_role_type,
        extracted_job_title: data.extracted_job_title,
        extracted_themes: data.extracted_themes ?? [],
        extracted_phrases: data.extracted_phrases ?? [],
        extracted_seniority: data.extracted_seniority,
      },
      jd_text: data.raw_text ?? '',
    })
  } catch (error) {
    console.error('[[id]/route.ts]', error)
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
    const update: Record<string, unknown> = {}
    if (Array.isArray(body.extracted_phrases)) update.extracted_phrases = body.extracted_phrases
    if (Array.isArray(body.extracted_themes))  update.extracted_themes  = body.extracted_themes
    if (typeof body.extracted_job_title === 'string') {
      update.extracted_job_title = body.extracted_job_title.trim().slice(0, 200) || null
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('job_descriptions')
      .update(update)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ id: data.id })
  } catch (error) {
    console.error('[[id]/route.ts]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
