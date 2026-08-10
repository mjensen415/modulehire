import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { getOrgRole } from '@/lib/business/org-access'

const STATUSES = new Set(['new', 'reviewing', 'shortlisted', 'interviewing', 'offered', 'rejected'])

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const jobId = url.searchParams.get('job_id')
    if (!isUuid(jobId)) return NextResponse.json({ error: 'Invalid job_id' }, { status: 400 })

    const status = url.searchParams.get('status')
    if (status && !STATUSES.has(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const limitParam = Number(url.searchParams.get('limit') ?? '50')
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50
    const offsetParam = Number(url.searchParams.get('offset') ?? '0')
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0

    const { data: job, error: jobError } = await supabase
      .from('job_postings')
      .select('org_id')
      .eq('id', jobId)
      .single()
    if (jobError || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const role = await getOrgRole(supabase, job.org_id, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let query = supabase
      .from('applicants')
      .select(
        'id, name, email, parsed_headline, overall_score, has_dealbreaker, status, scored_at, created_at, applicant_criterion_scores ( criterion_id, score, met )',
        { count: 'exact' }
      )
      .eq('job_id', jobId)

    if (status) query = query.eq('status', status)

    const { data: applicants, error, count } = await query
      .order('overall_score', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) throw error

    return NextResponse.json({ applicants: applicants ?? [], total: count ?? 0 })
  } catch (error) {
    console.error('[business/applicants GET]', error)
    return NextResponse.json({ error: 'Could not load applicants.' }, { status: 500 })
  }
}
