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
      .select('id, raw_text, extracted_company, extracted_role_type, extracted_themes, extracted_phrases, extracted_seniority')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      jd: {
        jd_id: data.id,
        extracted_company: data.extracted_company,
        extracted_role_type: data.extracted_role_type,
        extracted_themes: data.extracted_themes ?? [],
        extracted_phrases: data.extracted_phrases ?? [],
        extracted_seniority: data.extracted_seniority,
      },
      jd_text: data.raw_text ?? '',
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
