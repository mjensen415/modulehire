import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [jdsRes, prepRes] = await Promise.all([
      supabase
        .from('job_descriptions')
        .select('id, extracted_job_title, extracted_company, source_url, created_at')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('interview_prep_cache')
        .select('job_description_id')
        .eq('user_id', user.id),
    ])
    if (jdsRes.error) throw jdsRes.error
    if (prepRes.error) throw prepRes.error

    const preppedIds = new Set((prepRes.data ?? []).map((r) => r.job_description_id))
    const jobDescriptions = (jdsRes.data ?? []).map((jd) => ({
      ...jd,
      has_prep: preppedIds.has(jd.id),
    }))

    return NextResponse.json({ job_descriptions: jobDescriptions })
  } catch (error) {
    console.error('[job-descriptions GET]', error)
    return NextResponse.json({ error: 'Could not load job descriptions.' }, { status: 500 })
  }
}
