import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { checkAndLog, checkOrgDailyScoreCap } from '@/lib/rate-limit'
import { getOrgRole } from '@/lib/business/org-access'
import { getOrgPlan, remainingMonthlyScores, monthlyLimitMessage, UPGRADE_CODE } from '@/lib/business/plan'
import {
  INTAKE_JOB_COLUMNS,
  MAX_RESUME_BYTES,
  extractResumeText,
  findDuplicate,
  intakeApplicant,
  isExternalSource,
  loadCriteria,
  resumeKind,
  type IntakeJob,
} from '@/lib/business/applicant-intake'

export const maxDuration = 120

const str = (v: FormDataEntryValue | null, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

// POST (multipart) — one candidate from an ATS export: job_id, file or resume_text, and optional
// name, email, external_source, external_id, ats_stage. The import wizard calls this once per
// candidate (a few at a time) so a large export never runs into the function time limit.
// Returns { status: 'created' | 'duplicate', applicant_id, ... }.
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await req.formData()
    const jobId = form.get('job_id')
    if (typeof jobId !== 'string' || !isUuid(jobId)) return NextResponse.json({ error: 'Invalid job_id' }, { status: 400 })

    const { data: job } = await supabase.from('job_postings').select(INTAKE_JOB_COLUMNS).eq('id', jobId).single()
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    const role = await getOrgRole(supabase, job.org_id, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const externalSourceRaw = str(form.get('external_source'), 20)
    const externalSource = isExternalSource(externalSourceRaw) ? externalSourceRaw : null
    const externalId = externalSource ? str(form.get('external_id'), 200) : null
    const email = str(form.get('email'), 200)

    // Duplicates are free: check before any limit so re-running an import costs nothing.
    const admin = await createAdminClient()
    const dup = await findDuplicate(admin, job.id, externalSource, externalId, email)
    if (dup) return NextResponse.json({ status: 'duplicate', applicant_id: dup })

    const limit = await checkAndLog(supabase, user.id, 'rl_biz_import', 400, 3600)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Import limit reached for this hour. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }
    const orgCap = await checkOrgDailyScoreCap(supabase, job.org_id)
    if (!orgCap.ok) {
      return NextResponse.json({ error: 'Daily AI-scoring limit reached for this org. Try again tomorrow.' }, { status: 429, headers: { 'Retry-After': String(orgCap.retryAfter) } })
    }
    if ((await remainingMonthlyScores(supabase, job.org_id)) <= 0) {
      const plan = await getOrgPlan(supabase, job.org_id)
      return NextResponse.json({ error: monthlyLimitMessage(plan), code: UPGRADE_CODE }, { status: 402 })
    }

    const file = form.get('file')
    let rawText = str(form.get('resume_text'), 200_000) ?? ''
    let stored: { buffer: Buffer; filename: string; contentType: string } | null = null
    if (file && typeof file !== 'string') {
      if (file.size > MAX_RESUME_BYTES) return NextResponse.json({ error: 'Resume file is over 10 MB.' }, { status: 413 })
      if (!resumeKind(file.name, file.type)) return NextResponse.json({ error: 'Resume must be a PDF, Word (.docx) or text file.' }, { status: 400 })
      const buffer = Buffer.from(await file.arrayBuffer())
      rawText = await extractResumeText(buffer, file.name, file.type)
      stored = { buffer, filename: file.name, contentType: file.type }
    }
    if (!rawText.trim()) {
      return NextResponse.json({ error: stored ? 'Could not read any text in that resume (it may be a scan).' : 'No resume for this candidate.' }, { status: 400 })
    }

    const result = await intakeApplicant({
      supabase,
      admin,
      userId: user.id,
      job: job as IntakeJob,
      criteria: await loadCriteria(supabase, job.id),
      rawText,
      name: str(form.get('name'), 200),
      email,
      source: 'import',
      externalSource,
      externalId,
      atsStage: str(form.get('ats_stage'), 120),
      file: stored,
    })

    if (result.status === 'duplicate') return NextResponse.json({ status: 'duplicate', applicant_id: result.applicantId })
    return NextResponse.json({
      status: 'created',
      applicant_id: result.applicantId,
      name: result.name,
      overall_score: result.overallScore,
      has_dealbreaker: result.hasDealbreaker,
    })
  } catch (error) {
    console.error('[business/applicants/import POST]', error)
    return NextResponse.json({ error: 'Could not import this candidate.' }, { status: 500 })
  }
}
