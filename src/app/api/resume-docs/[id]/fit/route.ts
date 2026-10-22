import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid } from '@/lib/validate'
import { sanitizeCriteria } from '@/lib/dimensions'
import { docEvidence, parseResumeDoc } from '@/lib/resume-doc'
import { scoreCriteria } from '@/lib/criteria-score'

export const maxDuration = 120

type RouteContext = { params: Promise<{ id: string }> }

export type DocFitReport = {
  overall: number
  criteria: Array<{ label: string; score: number; bucket: 'strong' | 'partial' | 'gap'; why: string }>
  doc_version: number
  generated_at: string
}

// POST — the stored fit of the resume as last saved, scored with the match report's prompt so
// it's on the same scale. The editor calls this after 10s idle and eases its live preview to
// the result. Cached per document version: re-scoring an unchanged doc costs nothing.
export async function POST(_req: Request, { params }: RouteContext) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { data: row } = await supabase
      .from('resume_documents')
      .select('doc, version, fit_report, job_description_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const cached = row.fit_report as DocFitReport | null
    if (cached && cached.doc_version === row.version) return NextResponse.json(cached)

    if (!row.job_description_id) return NextResponse.json({ error: 'This resume has no job description to score against.' }, { status: 400 })
    const { data: jd } = await supabase
      .from('job_descriptions')
      .select('extracted_company, extracted_job_title, extracted_role_type, extracted_criteria')
      .eq('id', row.job_description_id)
      .eq('user_id', user.id)
      .maybeSingle()
    const criteria = sanitizeCriteria(jd?.extracted_criteria)
    if (criteria.length === 0) return NextResponse.json({ error: 'This job description has no criteria to score against.' }, { status: 400 })

    const parsed = parseResumeDoc(row.doc)
    if (!parsed.ok) return NextResponse.json({ error: 'This resume document is damaged.' }, { status: 422 })

    const limit = await checkAndLog(supabase, user.id, 'rl_doc_fit', 60, 3600)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }

    const jobLabel = `${jd?.extracted_job_title || jd?.extracted_role_type || 'this role'}${jd?.extracted_company ? ` at ${jd.extracted_company}` : ''}`
    const report = await scoreCriteria(criteria, docEvidence(parsed.doc), jobLabel, { userId: user.id, action: 'ai_doc_fit' })
    const fit: DocFitReport = {
      overall: report.overall,
      criteria: report.criteria.map(c => ({ label: c.label, score: c.score, bucket: c.bucket, why: c.why })),
      doc_version: row.version,
      generated_at: report.generated_at,
    }

    // Only store it if nobody saved a newer version meanwhile.
    const { error: saveError } = await supabase
      .from('resume_documents')
      .update({ fit_report: fit })
      .eq('id', id)
      .eq('version', row.version)
    if (saveError) console.error('[resume-docs fit] save failed:', saveError)

    return NextResponse.json(fit)
  } catch (error) {
    console.error('[resume-docs fit]', error)
    return NextResponse.json({ error: 'Could not score this resume.' }, { status: 500 })
  }
}
