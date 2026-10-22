import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid } from '@/lib/validate'
import { getActiveProfileId } from '@/lib/profile'
import { type JdCriterion } from '@/lib/dimensions'
import { scoreCriteria, type Evidence } from '@/lib/criteria-score'

export const maxDuration = 120

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const limit = await checkAndLog(supabase, user.id, 'rl_match_report', 60, 3600)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }

    const { jd_id } = await req.json()
    if (!isUuid(jd_id)) {
      return NextResponse.json({ error: 'Invalid jd_id' }, { status: 400 })
    }

    const { data: jd, error: jdError } = await supabase
      .from('job_descriptions')
      .select('id, extracted_company, extracted_job_title, extracted_role_type, extracted_criteria, match_report, match_report_at, match_report_profile_id, updated_at, source_url')
      .eq('id', jd_id)
      .eq('user_id', user.id)
      .single()
    if (jdError || !jd) return NextResponse.json({ error: 'Job description not found' }, { status: 404 })

    const criteria = (Array.isArray(jd.extracted_criteria) ? jd.extracted_criteria : []) as JdCriterion[]
    if (criteria.length === 0) {
      return NextResponse.json({ error: 'This job description has no extracted criteria yet — analyze it first.' }, { status: 400 })
    }

    const profileId = await getActiveProfileId(supabase, user.id)

    const { data: modules, error: modError } = await supabase
      .from('modules')
      .select('id, title, content, dimensions, weight, source_company, source_role_title, updated_at')
      .eq('user_id', user.id)
      .eq('profile_id', profileId)
      .is('deleted_at', null)
    if (modError) throw modError

    // Cache: reuse a saved report when it was generated for this profile, after the JD was
    // last edited (criteria weight/removal edits invalidate it), and after every module's
    // last edit (a newly added/edited module could change the evidence).
    const newestModuleUpdate = (modules ?? []).reduce((max, m) => (m.updated_at > max ? m.updated_at : max), '1970-01-01T00:00:00Z')
    if (
      jd.match_report &&
      jd.match_report_profile_id === profileId &&
      jd.match_report_at &&
      jd.match_report_at > jd.updated_at &&
      jd.match_report_at > newestModuleUpdate
    ) {
      return NextResponse.json(jd.match_report)
    }

    const jobLabel = `${jd.extracted_job_title ?? jd.extracted_role_type ?? 'this role'}${jd.extracted_company ? ` at ${jd.extracted_company}` : ''}`
    const evidence: Evidence[] = (modules ?? []).map(m => ({
      id: m.id,
      title: m.title,
      content: String(m.content ?? ''),
      dimensions: m.dimensions,
      label: `${m.source_company ?? ''}${m.source_role_title ? ` (${m.source_role_title})` : ''}`,
      source_company: m.source_company,
    }))
    const report = await scoreCriteria(criteria, evidence, jobLabel, { userId: user.id, action: 'match_report' })
    const generatedAt = report.generated_at

    const { error: updateError } = await supabase
      .from('job_descriptions')
      .update({ match_report: report, match_report_at: generatedAt, match_report_profile_id: profileId })
      .eq('id', jd_id)
    if (updateError) console.error('[match-report] save failed:', updateError)

    return NextResponse.json(report)
  } catch (error) {
    console.error('[match-report]', error)
    return NextResponse.json({ error: 'Could not generate match report.' }, { status: 500 })
  }
}
