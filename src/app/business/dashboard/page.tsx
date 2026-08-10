import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type JobRow = {
  id: string
  title: string
  status: string
  applicant_count: number
  created_at: string
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  draft: { color: 'var(--text3)', bg: 'var(--bg3)' },
  active: { color: 'var(--teal)', bg: 'var(--teal-dim)' },
  paused: { color: 'var(--amber)', bg: 'var(--amber-dim)' },
  closed: { color: 'var(--text3)', bg: 'var(--bg3)' },
}

function scoreColor(score: number) {
  if (score >= 80) return '#1d9e75'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function BusinessDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const { data: membership } = await supabase
    .from('org_members')
    .select('organizations ( id, name, slug, tier )')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  type OrgRow = { id: string; name: string; slug: string; tier: string }
  const org = (membership?.organizations as unknown as OrgRow | null) ?? null

  if (!org) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.02em' }}>
            Welcome to ModuleHire for Business
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24, lineHeight: 1.6 }}>
            Set up your organization to start reviewing applicants.
          </p>
          <Link href="/business/onboarding" className="btn-primary" style={{ display: 'inline-flex', textDecoration: 'none' }}>
            Create organization →
          </Link>
        </div>
      </div>
    )
  }

  const { data: jobs } = await supabase
    .from('job_postings')
    .select('id, title, status, applicant_count, created_at')
    .eq('org_id', org.id)
    .order('created_at', { ascending: false })

  const jobRows = (jobs ?? []) as JobRow[]
  const activeJobs = jobRows.filter((j) => j.status === 'active').length
  const totalApplicants = jobRows.reduce((sum, j) => sum + (j.applicant_count ?? 0), 0)

  const { data: applicants } = await supabase
    .from('applicants')
    .select('job_id, overall_score')
    .eq('org_id', org.id)
    .not('overall_score', 'is', null)

  const scoredApplicants = (applicants ?? []) as { job_id: string; overall_score: number }[]
  const avgScore = scoredApplicants.length
    ? Math.round(scoredApplicants.reduce((sum, a) => sum + a.overall_score, 0) / scoredApplicants.length)
    : null

  const topScoreByJob = new Map<string, number>()
  for (const a of scoredApplicants) {
    const current = topScoreByJob.get(a.job_id)
    if (current === undefined || a.overall_score > current) topScoreByJob.set(a.job_id, a.overall_score)
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 24, letterSpacing: '-0.02em' }}>
        {org.name}
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
        <div className="stat-card">
          <div className="stat-label">Active jobs</div>
          <div className="stat-value">{activeJobs}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total applicants</div>
          <div className="stat-value">{totalApplicants}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg score</div>
          <div className="stat-value">{avgScore ?? '—'}</div>
        </div>
      </div>

      <div className="section-card">
        <div className="section-head">
          <div className="section-head-title">Recent jobs</div>
          <Link href="/business/jobs" className="section-head-action">View all →</Link>
        </div>

        {jobRows.length === 0 ? (
          <div style={{ padding: '44px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 14 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
              Post your first job
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 20, maxWidth: 340, margin: '0 auto 20px' }}>
              Start by creating a job posting, then add your scoring criteria and upload applicants — we&apos;ll score and rank them for you.
            </div>
            <Link href="/business/jobs/new" className="btn-primary" style={{ display: 'inline-flex', textDecoration: 'none' }}>
              + Create a job posting
            </Link>
          </div>
        ) : (
          <div>
            {jobRows.slice(0, 10).map((job) => {
              const statusCfg = STATUS_COLORS[job.status] ?? STATUS_COLORS.draft
              const topScore = topScoreByJob.get(job.id)
              return (
                <Link
                  key={job.id}
                  href={`/business/jobs/${job.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--border)',
                    textDecoration: 'none',
                    color: 'var(--text)',
                  }}
                >
                  <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.title}
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                    color: statusCfg.color, background: statusCfg.bg, textTransform: 'capitalize',
                  }}>
                    {job.status}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text3)', width: 90, textAlign: 'right' }}>
                    {job.applicant_count} applicant{job.applicant_count === 1 ? '' : 's'}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, width: 40, textAlign: 'right', color: topScore != null ? scoreColor(topScore) : 'var(--text3)' }}>
                    {topScore ?? '—'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text3)', width: 90, textAlign: 'right' }}>
                    {formatDate(job.created_at)}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
