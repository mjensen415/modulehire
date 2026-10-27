import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid } from '@/lib/validate'
import { draftGenerateBody } from '@/lib/draft-request'
import { internalRequest } from '@/lib/internal-call'
import { POST as generateResume } from '@/app/api/generate-resume/route'

export const maxDuration = 120

type RouteContext = { params: Promise<{ generatedResumeId: string }> }

// POST — makes a resume generated before the live editor editable: rebuilds its document from
// the same modules and job (one AI call through generate-resume's doc-only mode, no new match),
// attached to the existing resume. The original files stay linked. Not counted against the
// monthly resume limit; rate limited separately.
export async function POST(req: Request, { params }: RouteContext) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { generatedResumeId } = await params
    if (!isUuid(generatedResumeId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { data: resume } = await supabase
      .from('generated_resumes')
      .select('id, module_ids_used, job_description_id')
      .eq('id', generatedResumeId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!resume) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Already editable: hand back the existing document.
    const { data: existing } = await supabase
      .from('resume_documents')
      .select('id')
      .eq('generated_resume_id', resume.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (existing) return NextResponse.json({ doc_id: existing.id })

    if (!resume.job_description_id) {
      return NextResponse.json({ error: 'This resume isn\'t linked to a job posting, so it can\'t be rebuilt. Start a new one from the posting.' }, { status: 409 })
    }

    // Only modules that still exist.
    const usedIds: string[] = Array.isArray(resume.module_ids_used) ? resume.module_ids_used.filter(isUuid) : []
    const { data: modules } = usedIds.length > 0
      ? await supabase.from('modules').select('id, title, type').in('id', usedIds).eq('user_id', user.id).is('deleted_at', null)
      : { data: [] as Array<{ id: string; title: string; type: string }> }
    const alive = new Set((modules ?? []).map(m => m.id))
    const moduleIds = usedIds.filter(id => alive.has(id))
    if (moduleIds.length === 0) {
      return NextResponse.json({ error: 'The modules behind this resume were removed. Start a new one from the job posting.' }, { status: 409 })
    }

    const { data: jd } = await supabase
      .from('job_descriptions')
      .select('id, extracted_role_type, extracted_seniority, extracted_themes, extracted_phrases')
      .eq('id', resume.job_description_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!jd) return NextResponse.json({ error: 'The job posting behind this resume was removed. Start a new one from the posting.' }, { status: 409 })

    const limit = await checkAndLog(supabase, user.id, 'rl_doc_from_legacy', 20, 3600)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }

    const skillTitles = (modules ?? []).filter(m => m.type === 'skill').map(m => m.title ?? '')
    const body = await draftGenerateBody(
      supabase,
      user,
      { jd_id: jd.id, extracted_role_type: jd.extracted_role_type, extracted_seniority: jd.extracted_seniority, extracted_themes: jd.extracted_themes ?? [], extracted_phrases: jd.extracted_phrases ?? [] },
      moduleIds,
      skillTitles,
      { cover_letter: { include: false, tone: 'professional' } },
    )
    const res = await generateResume(internalRequest(req.url, '/api/generate-resume', body, 'POST', { 'x-doc-only-for': resume.id }))
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.resume_doc_id) {
      return NextResponse.json({ error: data.error ?? 'We couldn\'t rebuild this resume. Try again.' }, { status: res.ok ? 500 : res.status })
    }
    return NextResponse.json({ doc_id: data.resume_doc_id })
  } catch (error) {
    console.error('[resume-docs from-generated]', error)
    return NextResponse.json({ error: 'We couldn\'t rebuild this resume. Try again.' }, { status: 500 })
  }
}
