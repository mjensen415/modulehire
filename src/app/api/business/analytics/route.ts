import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { getOrgRole } from '@/lib/business/org-access'

type JobRow = { id: string; title: string; status: string; applicant_count: number; created_at: string }
type ApplicantRow = { id: string; job_id: string; name: string | null; overall_score: number | null; scored_at: string | null }
type CriterionScoreRow = {
  criterion_id: string
  met: boolean | null
  scoring_criteria: { label: string; weight: string } | null
}

function scoreBucket(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  return 'D'
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgId = new URL(req.url).searchParams.get('org_id')
    if (!isUuid(orgId)) return NextResponse.json({ error: 'Invalid org_id' }, { status: 400 })

    const role = await getOrgRole(supabase, orgId, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [jobsRes, applicantsRes, criterionScoresRes] = await Promise.all([
      supabase
        .from('job_postings')
        .select('id, title, status, applicant_count, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false }),
      supabase
        .from('applicants')
        .select('id, job_id, name, overall_score, scored_at')
        .eq('org_id', orgId),
      supabase
        .from('applicant_criterion_scores')
        .select('criterion_id, met, scoring_criteria!inner(label, weight), applicants!inner(org_id)')
        .eq('applicants.org_id', orgId),
    ])

    if (jobsRes.error) throw jobsRes.error
    if (applicantsRes.error) throw applicantsRes.error
    if (criterionScoresRes.error) throw criterionScoresRes.error

    const jobs = (jobsRes.data ?? []) as JobRow[]
    const applicants = (applicantsRes.data ?? []) as ApplicantRow[]
    const criterionScores = (criterionScoresRes.data ?? []) as unknown as CriterionScoreRow[]

    // ── Per-job summary ──────────────────────────────────────────────────────
    const applicantsByJob = new Map<string, ApplicantRow[]>()
    for (const a of applicants) {
      const list = applicantsByJob.get(a.job_id) ?? []
      list.push(a)
      applicantsByJob.set(a.job_id, list)
    }

    const perJob = jobs.map((job) => {
      const jobApplicants = applicantsByJob.get(job.id) ?? []
      const scored = jobApplicants.filter((a) => a.overall_score != null)
      const avgScore = scored.length
        ? Math.round(scored.reduce((sum, a) => sum + (a.overall_score ?? 0), 0) / scored.length)
        : null
      const top3 = [...scored]
        .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))
        .slice(0, 3)
        .map((a) => ({ id: a.id, name: a.name, overall_score: a.overall_score }))

      return {
        job_id: job.id,
        title: job.title,
        status: job.status,
        applicant_count: job.applicant_count ?? jobApplicants.length,
        scored_count: scored.length,
        avg_score: avgScore,
        top_3_candidates: top3,
      }
    })

    // ── Criteria pass rates ──────────────────────────────────────────────────
    const criterionStats = new Map<string, { label: string; weight: string; met: number; total: number }>()
    for (const cs of criterionScores) {
      if (!cs.scoring_criteria) continue
      const existing = criterionStats.get(cs.criterion_id) ?? {
        label: cs.scoring_criteria.label,
        weight: cs.scoring_criteria.weight,
        met: 0,
        total: 0,
      }
      existing.total += 1
      if (cs.met === true) existing.met += 1
      criterionStats.set(cs.criterion_id, existing)
    }

    const criteriaPassRates = Array.from(criterionStats.entries())
      .map(([criterion_id, s]) => ({
        criterion_id,
        label: s.label,
        weight: s.weight,
        pass_rate: s.total > 0 ? Math.round((s.met / s.total) * 100) : 0,
        total_scored: s.total,
      }))
      .sort((a, b) => a.pass_rate - b.pass_rate)

    // ── Score distribution ───────────────────────────────────────────────────
    const scoreDistribution = { A: 0, B: 0, C: 0, D: 0 }
    for (const a of applicants) {
      if (a.overall_score == null) continue
      scoreDistribution[scoreBucket(a.overall_score)] += 1
    }

    // ── Totals ────────────────────────────────────────────────────────────────
    const totalScored = applicants.filter((a) => a.overall_score != null).length
    const totals = {
      total_applicants: applicants.length,
      total_scored: totalScored,
      total_jobs_open: jobs.filter((j) => j.status === 'active').length,
      avg_score: totalScored
        ? Math.round(applicants.reduce((sum, a) => sum + (a.overall_score ?? 0), 0) / totalScored)
        : null,
    }

    return NextResponse.json({
      jobs: perJob,
      criteria_pass_rates: criteriaPassRates,
      score_distribution: scoreDistribution,
      totals,
      generated_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[business/analytics GET]', error)
    return NextResponse.json({ error: 'Could not load analytics.' }, { status: 500 })
  }
}
