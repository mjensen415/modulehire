import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { checkAndLog, checkOrgDailyScoreCap } from '@/lib/rate-limit'
import { getOrgPlan, remainingMonthlyScores, monthlyLimitMessage, UPGRADE_CODE } from '@/lib/business/plan'
import { INTAKE_JOB_COLUMNS, extractResumeText, findDuplicate, intakeApplicant, loadCriteria, resumeKind, type IntakeJob } from '@/lib/business/applicant-intake'
import {
  WorkableError,
  downloadWorkableResume,
  getWorkableCandidate,
  isShortcode,
  postWorkableComment,
  workableCandidateIsActive,
} from '@/lib/business/workable'
import { scoreNote } from '@/lib/business/integrations'
import { providerFailure, workableContext } from '../../_shared'

export const maxDuration = 120

// POST { job_id, shortcode, candidate_id } — imports and scores one Workable candidate.
// Re-reads the candidate at import time (still active, on that job, fresh resume link).
// Returns { status: 'created' | 'duplicate' | 'skipped', reason?, applicant_id?, note_posted? }.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const candidateId = typeof body.candidate_id === 'string' ? body.candidate_id : ''
  if (!isUuid(body.job_id) || !isShortcode(body.shortcode) || !/^[A-Za-z0-9]{2,40}$/.test(candidateId)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const jobId = body.job_id as string
  const shortcode = body.shortcode

  const { data: job } = await supabase.from('job_postings').select(INTAKE_JOB_COLUMNS).eq('id', jobId).single()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const admin = await createAdminClient()
  const ctx = await workableContext(supabase, admin, user.id, { orgId: job.org_id })
  if (!ctx.ok) return ctx.res

  const dup = await findDuplicate(admin, job.id, 'workable', candidateId, null)
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
    const cand = await getWorkableCandidate(creds, candidateId)
    if (cand.job?.shortcode && cand.job.shortcode !== shortcode) return NextResponse.json({ status: 'skipped', reason: 'Not on this Workable job' })
    if (!workableCandidateIsActive(cand)) return NextResponse.json({ status: 'skipped', reason: 'Disqualified or hired in Workable' })
    if (!cand.resume_url) return NextResponse.json({ status: 'skipped', reason: 'No resume in Workable' })

    let file
    try {
      file = await downloadWorkableResume(cand)
    } catch (e) {
      if (e instanceof WorkableError && e.status === 413) return NextResponse.json({ status: 'skipped', reason: e.message })
      throw e
    }
    if (!resumeKind(file.filename, file.contentType)) return NextResponse.json({ status: 'skipped', reason: 'Resume is not a PDF, Word or text file' })
    const rawText = await extractResumeText(file.buffer, file.filename, file.contentType)
    if (!rawText.trim()) return NextResponse.json({ status: 'skipped', reason: 'No readable text in the resume (it may be a scan)' })

    const result = await intakeApplicant({
      supabase,
      admin,
      userId: user.id,
      job: job as IntakeJob,
      criteria: await loadCriteria(supabase, job.id),
      rawText,
      name: cand.name || [cand.firstname, cand.lastname].filter(Boolean).join(' ') || null,
      email: cand.email,
      source: 'workable',
      externalSource: 'workable',
      externalId: candidateId,
      atsStage: cand.stage,
      file,
    })
    if (result.status === 'duplicate') return NextResponse.json({ status: 'duplicate', applicant_id: result.applicantId })

    let notePosted = false
    let noteError: string | null = null
    const memberId = typeof ctx.conn.config.member_id === 'string' ? ctx.conn.config.member_id : null
    if (ctx.conn.writebackEnabled && memberId) {
      try {
        const { data: row } = await admin.from('applicants').select('parsed_headline').eq('id', result.applicantId).single()
        await postWorkableComment(creds, {
          candidateId,
          memberId,
          body: scoreNote({ score: result.overallScore, dealbreaker: result.hasDealbreaker, headline: (row?.parsed_headline as string | null) ?? null, jobId: job.id, jobTitle: job.title }),
        })
        await admin.from('applicants').update({ ats_note_posted_at: new Date().toISOString() }).eq('id', result.applicantId)
        notePosted = true
      } catch (e) {
        noteError = e instanceof Error ? e.message : 'Could not post the comment'
        console.error('[integrations/workable import comment]', e)
      }
    }

    return NextResponse.json({
      status: 'created', applicant_id: result.applicantId, name: result.name, overall_score: result.overallScore,
      has_dealbreaker: result.hasDealbreaker, note_posted: notePosted, note_error: noteError,
    })
  } catch (e) {
    return providerFailure(admin, ctx.orgId, 'workable', e, 'import')
  }
}
