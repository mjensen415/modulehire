import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { title, content, weight, type, source_company, source_role_title, date_start, date_end, employment_type } = body

    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    if (!content?.trim()) return NextResponse.json({ error: 'Content is required' }, { status: 400 })

    const { data, error } = await supabase
      .from('modules')
      .insert({
        user_id: user.id,
        title: title.trim(),
        content: content.trim(),
        weight: weight ?? 'supporting',
        type: type ?? 'experience',
        source_company: source_company?.trim() || null,
        source_role_title: source_role_title?.trim() || null,
        date_start: date_start?.trim() || null,
        date_end: date_end?.trim() || null,
        employment_type: employment_type?.trim() || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ module: data }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
