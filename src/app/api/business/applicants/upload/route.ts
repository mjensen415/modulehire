import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { checkAndLog } from '@/lib/rate-limit'
import { getOrgRole } from '@/lib/business/org-access'
import { scoreApplicant } from '@/lib/business/score-applicant'

export const maxDuration = 60

async function extractText(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    const { getDocumentProxy, extractText: unpdfExtract } = await import('unpdf')
    const buffer = Buffer.from(await file.arrayBuffer())
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await unpdfExtract(pdf, { mergePages: true })
    return text
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
    return buffer.toString('utf-8')
  }

  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const limit = await checkAndLog(supabase, user.id, 'rl_biz_upload', 50, 3600)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }

    const formData = await req.formData()
    const jobId = formData.get('job_id')
    if (typeof jobId !== 'string' || !isUuid(jobId)) {
      return NextResponse.json({ error: 'Invalid job_id' }, { status: 400 })
    }

    const { data: job, error: jobError } = await supabase
      .from('job_postings')
      .select('id, org_id, title, extracted_company, extracted_themes, extracted_phrases')
      .eq('id', jobId)
      .single()
    if (jobError || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const role = await getOrgRole(supabase, job.org_id, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const file = formData.get('file') as File | null
    const resumeTextField = formData.get('resume_text')

    let rawText: string
    if (file) {
      rawText = await extractText(file)
    } else if (typeof resumeTextField === 'string' && resumeTextField.trim()) {
      rawText = resumeTextField
    } else {
      return NextResponse.json({ error: 'Provide either file or resume_text' }, { status: 400 })
    }

    if (!rawText.trim()) {
      return NextResponse.json({ error: 'Could not extract text from resume' }, { status: 400 })
    }

    const name = formData.get('name')
    const email = formData.get('email')

    const { data: applicant, error: insertError } = await supabase
      .from('applicants')
      .insert({
        org_id: job.org_id,
        job_id: job.id,
        name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 200) : null,
        email: typeof email === 'string' && email.trim() ? email.trim().slice(0, 200) : null,
        raw_text: rawText,
        source: 'upload',
        status: 'new',
      })
      .select()
      .single()
    if (insertError) throw insertError

    const { data: criteria, error: criteriaError } = await supabase
      .from('scoring_criteria')
      .select('id, label, weight, description, criterion_type, min_years')
      .eq('job_id', job.id)
      .order('sort_order', { ascending: true })
    if (criteriaError) throw criteriaError

    await scoreApplicant({
      applicantId: applicant.id,
      rawText,
      jobTitle: job.title,
      jobCompany: job.extracted_company ?? null,
      themes: job.extracted_themes ?? [],
      phrases: job.extracted_phrases ?? [],
      criteria: criteria ?? [],
      supabase,
    })

    const { data: finalApplicant, error: finalError } = await supabase
      .from('applicants')
      .select('id, name, email, parsed_headline, overall_score, has_dealbreaker, status, scored_at')
      .eq('id', applicant.id)
      .single()
    if (finalError) throw finalError

    const { data: scores } = await supabase
      .from('applicant_criterion_scores')
      .select('criterion_id, score, met, evidence')
      .eq('applicant_id', applicant.id)

    return NextResponse.json({
      applicant: { ...finalApplicant, criteria_scores: scores ?? [] },
    })
  } catch (error) {
    console.error('[business/applicants/upload POST]', error)
    return NextResponse.json({ error: 'Could not process applicant.' }, { status: 500 })
  }
}
