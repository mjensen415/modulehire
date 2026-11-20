import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { checkAndLog, checkOrgDailyScoreCap } from '@/lib/rate-limit'
import { getOrgPlan, remainingMonthlyScores, monthlyLimitMessage, UPGRADE_CODE } from '@/lib/business/plan'
import {
  INTAKE_JOB_COLUMNS,
  extractResumeText,
  findDuplicate,
  intakeApplicant,
  loadCriteria,
  resumeKind,
  type IntakeJob,
} from '@/lib/business/applicant-intake'
import {
  downloadAttachment,
  getApplication,
  getCandidate,
  optedOutCandidates,
  postScoreNote,
  resumeForApplication,
} from '@/lib/business/greenhouse'
import { scoreNote } from '@/lib/business/integrations'
import { greenhouseContext, greenhouseFailure } from '../../_shared'

export const maxDuration = 120

// POST { job_id, gh_job_id, application_id } — imports and scores one Greenhouse application.
// Re-reads the application, the candidate's AI opt-out and the resume link at import time.
// Returns { status: 'created' | 'duplicate' | 'skipped', reason?, applicant_id?, note_posted? }.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const ghJobId = Number(body.gh_job_id)
  const applicationId = Number(body.application_id)
  if (!isUuid(body.job_id) || !Number.isSafeInteger(ghJobId) || !Number.isSafeInteger(applicationId) || ghJobId <= 0 || applicationId <= 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const jobId = body.job_id as string

  const { data: job } = await supabase.from('job_postings').select(INTAKE_JOB_COLUMNS).eq('id', jobId).single()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const admin = await createAdminClient()
  const ctx = await greenhouseContext(supabase, admin, user.id, { orgId: job.org_id })
  if (!ctx.ok) return ctx.res

  const externalId = String(applicationId)
  const dup = await findDuplicate(admin, job.id, 'greenhouse', externalId, null)
  if (dup) return NextResponse.json({ status: 'duplicate', applicant_id: dup })

  const limit = await checkAndLog(supabase, user.id, 'rl_biz_import', 400, 3600)
  if (!limit.ok) return NextResponse.json({ error: 'Import limit reached for this hour. Try again later.' }, { status: 429 })
  const orgCap = await checkOrgDailyScoreCap(supabase, job.org_id)
  if (!orgCap.ok) return NextResponse.json({ error: 'Daily AI-scoring limit reached for this org. Try again tomorrow.' }, { status: 429 })
  if ((await remainingMonthlyScores(supabase, job.org_id)) <= 0) {
    const plan = await getOrgPlan(supabase, job.org_id)
    return NextResponse.json({ error: monthlyLimitMessage(plan), code: UPGRADE_CODE }, { status: 402 })
  }

  try {
    const { creds } = ctx.conn
    const app = await getApplication(creds, applicationId)
    if (!app || app.status !== 'in_process') return NextResponse.json({ status: 'skipped', reason: 'No longer in process in Greenhouse' })
    // The candidate must belong to the job the user picked, or an id from another job could slip in.
    if (app.job_id !== ghJobId) return NextResponse.json({ status: 'skipped', reason: 'Not on this Greenhouse job' })

    const optedOut = await optedOutCandidates(creds, ghJobId)
    if (optedOut.has(app.candidate_id)) return NextResponse.json({ status: 'skipped', reason: 'Opted out of AI review' })

    const resume = await resumeForApplication(creds, applicationId)
    if (!resume) return NextResponse.json({ status: 'skipped', reason: 'No resume in Greenhouse' })
    if (!resumeKind(resume.filename)) return NextResponse.json({ status: 'skipped', reason: 'Resume is not a PDF, Word or text file' })

    const buffer = await downloadAttachment(creds, resume)
    const rawText = await extractResumeText(buffer, resume.filename)
    if (!rawText.trim()) return NextResponse.json({ status: 'skipped', reason: 'No readable text in the resume (it may be a scan)' })
    const person = await getCandidate(creds, app.candidate_id)

    const result = await intakeApplicant({
      supabase,
      admin,
      userId: user.id,
      job: job as IntakeJob,
      criteria: await loadCriteria(supabase, job.id),
      rawText,
      name: person.name,
      email: person.email,
      source: 'greenhouse',
      externalSource: 'greenhouse',
      externalId,
      atsStage: app.stage_name,
      file: { buffer, filename: resume.filename, contentType: '' },
    })
    if (result.status === 'duplicate') return NextResponse.json({ status: 'duplicate', applicant_id: result.applicantId })

    let notePosted = false
    let noteError: string | null = null
    if (ctx.conn.writebackEnabled) {
      try {
        const { data: row } = await admin.from('applicants').select('parsed_headline').eq('id', result.applicantId).single()
        await postScoreNote(creds, {
          candidateId: app.candidate_id,
          applicationId,
          body: scoreNote({ score: result.overallScore, dealbreaker: result.hasDealbreaker, headline: (row?.parsed_headline as string | null) ?? null, jobId: job.id, jobTitle: job.title }),
        })
        await admin.from('applicants').update({ ats_note_posted_at: new Date().toISOString() }).eq('id', result.applicantId)
        notePosted = true
      } catch (e) {
        // The import still counts; the note is a bonus. Most often the credential lacks notes:create.
        noteError = e instanceof Error ? e.message : 'Could not post the note'
        console.error('[integrations/greenhouse import note]', e)
      }
    }

    return NextResponse.json({
      status: 'created',
      applicant_id: result.applicantId,
      name: result.name,
      overall_score: result.overallScore,
      has_dealbreaker: result.hasDealbreaker,
      note_posted: notePosted,
      note_error: noteError,
    })
  } catch (e) {
    return greenhouseFailure(admin, ctx.orgId, e, 'import')
  }
}
