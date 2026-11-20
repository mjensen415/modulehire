import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { providerLabel } from '@/lib/business/ats/registry'

// Business dashboard. Styles: src/app/business/business.css (.biz-*).

type JobRow = {
  id: string
  title: string
  status: string
  applicant_count: number
  created_at: string
  external_source: string | null
}

type ApplicantRow = {
  job_id: string
  overall_score: number | null
  has_dealbreaker: boolean | null
  status: string | null
  source: string | null
  created_at: string
}

const STAGES = [
  { key: 'new', label: 'New', color: 'var(--biz-stage-new)' },
  { key: 'reviewing', label: 'Reviewing', color: 'var(--biz-stage-review)' },
  { key: 'shortlisted', label: 'Shortlisted', color: 'var(--biz-stage-short)' },
  { key: 'interviewing', label: 'Interviewing', color: 'var(--biz-stage-int)' },
] as const

const SOURCE_LABELS: Record<string, string> = {
  upload: 'Direct upload',
  bulk: 'Direct upload',
  csv: 'CSV import',
  import: 'File import',
  link: 'Link',
  email: 'Email',
}

function sourceLabel(job: JobRow, sources: Map<string, number> | undefined): string {
  if (job.external_source) return providerLabel(job.external_source) ?? job.external_source
  if (!sources || sources.size === 0) return 'No applicants yet'
  const [top] = [...sources.entries()].sort((a, b) => b[1] - a[1])
  return providerLabel(top[0]) ?? SOURCE_LABELS[top[0]] ?? top[0]
}

function scoreClass(score: number | undefined) {
  if (score == null) return 'none'
  if (score >= 80) return 'hi'
  if (score >= 60) return 'mid'
  return 'lo'
}

function weekAgoMs() {
  return Date.now() - 7 * 24 * 60 * 60 * 1000
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
      <div className="biz-inner">
        <div className="biz-card biz-empty" style={{ marginTop: '10vh' }}>
          <h2>Welcome to ModuleHire for Business</h2>
          <p>Set up your organization to start ranking applicants.</p>
          <Link href="/business/onboarding" className="biz-btn">Create organization</Link>
        </div>
      </div>
    )
  }

  const [{ data: jobs }, { data: applicants }] = await Promise.all([
    supabase
      .from('job_postings')
      .select('id, title, status, applicant_count, created_at, external_source')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('applicants')
      .select('job_id, overall_score, has_dealbreaker, status, source, created_at')
      .eq('org_id', org.id),
  ])

  const jobRows = (jobs ?? []) as JobRow[]
  const appRows = (applicants ?? []) as ApplicantRow[]
  const openJobs = jobRows.filter((j) => j.status !== 'closed')
  const weekAgo = weekAgoMs()

  type JobStats = { top?: number; stages: Record<string, number>; sources: Map<string, number>; recent: number; total: number }
  const byJob = new Map<string, JobStats>()
  let strong = 0
  let waiting = 0
  let dealbreakers = 0
  let newThisWeek = 0
  for (const a of appRows) {
    let s = byJob.get(a.job_id)
    if (!s) { s = { stages: {}, sources: new Map(), recent: 0, total: 0 }; byJob.set(a.job_id, s) }
    s.total += 1
    const stage = a.status ?? 'new'
    s.stages[stage] = (s.stages[stage] ?? 0) + 1
    if (a.source) s.sources.set(a.source, (s.sources.get(a.source) ?? 0) + 1)
    if (a.overall_score != null && (s.top === undefined || a.overall_score > s.top)) s.top = a.overall_score
    if (new Date(a.created_at).getTime() >= weekAgo) { s.recent += 1; newThisWeek += 1 }
    if (a.has_dealbreaker) dealbreakers += 1
    else if (a.overall_score != null && a.overall_score >= 80) strong += 1
    if (stage === 'new' && !a.has_dealbreaker) waiting += 1
  }

  const sorted = [...openJobs].sort((a, b) => (byJob.get(b.id)?.recent ?? 0) - (byJob.get(a.id)?.recent ?? 0))

  return (
    <div className="biz-inner">
      <header className="biz-head">
        <div>
          <h1 className="biz-h1">Hiring at {org.name}</h1>
          <p className="biz-sub">
            {openJobs.length} open posting{openJobs.length === 1 ? '' : 's'}.{' '}
            {newThisWeek > 0 ? `${newThisWeek} new applicant${newThisWeek === 1 ? '' : 's'} in the last 7 days.` : 'No new applicants this week.'}
          </p>
        </div>
        <div className="biz-actions">
          <Link href="/business/jobs" className="biz-btn biz-btn-ghost">All postings</Link>
          <Link href="/business/jobs/new" className="biz-btn">+ New posting</Link>
        </div>
      </header>

      <section aria-label="Pipeline totals" className="biz-stats">
        <div className="biz-stat">
          <span className="biz-stat-label biz-muted">Applicants</span>
          <span className="biz-stat-value">{appRows.length}</span>
          <span className="biz-stat-note biz-muted">across {openJobs.length} posting{openJobs.length === 1 ? '' : 's'}</span>
        </div>
        <div className="biz-stat teal">
          <span className="biz-stat-label">Strong matches</span>
          <span className="biz-stat-value">{strong}</span>
          <span className="biz-stat-note">score 80 or higher</span>
        </div>
        <div className="biz-stat sand">
          <span className="biz-stat-label">Waiting on review</span>
          <span className="biz-stat-value">{waiting}</span>
          <span className="biz-stat-note">still in New</span>
        </div>
        <div className="biz-stat clay">
          <span className="biz-stat-label">Missed a dealbreaker</span>
          <span className="biz-stat-value">{dealbreakers}</span>
          <span className="biz-stat-note">hidden by default</span>
        </div>
      </section>

      <section aria-labelledby="post-h" className="biz-card" style={{ overflow: 'hidden' }}>
        <div className="biz-card-head">
          <h2 id="post-h" className="biz-h2">Open postings</h2>
          {sorted.length > 0 && <span className="biz-muted" style={{ fontSize: 13 }}>Sorted by most new applicants</span>}
        </div>

        {sorted.length === 0 ? (
          <div className="biz-empty">
            <h2>Post your first job</h2>
            <p>Paste the job description, set what matters, then upload applicants or import them from your ATS. We score and rank every one.</p>
            <Link href="/business/jobs/new" className="biz-btn">+ Create a posting</Link>
          </div>
        ) : (
          <>
            <div className="biz-table-wrap">
              <table className="biz-table">
                <thead>
                  <tr>
                    <th scope="col">Posting</th>
                    <th scope="col">Source</th>
                    <th scope="col">Pipeline</th>
                    <th scope="col">Top score</th>
                    <th scope="col">New this week</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((job) => {
                    const s = byJob.get(job.id)
                    const total = s?.total ?? 0
                    const shortlisted = s?.stages.shortlisted ?? 0
                    return (
                      <tr key={job.id}>
                        <td>
                          <Link href={`/business/jobs/${job.id}`} className="biz-row-link">{job.title}</Link>
                          <div className="biz-muted" style={{ fontSize: 12.5 }}>
                            {job.status === 'active' ? 'Active' : job.status.charAt(0).toUpperCase() + job.status.slice(1)} · opened {formatDate(job.created_at)}
                          </div>
                        </td>
                        <td><span className="biz-chip">{sourceLabel(job, s?.sources)}</span></td>
                        <td style={{ width: 260 }}>
                          <div
                            className="biz-pipe"
                            role="img"
                            aria-label={STAGES.map((st) => `${s?.stages[st.key] ?? 0} ${st.label.toLowerCase()}`).join(', ')}
                          >
                            {total > 0 && STAGES.map((st) => {
                              const n = s?.stages[st.key] ?? 0
                              return n > 0 ? <span key={st.key} style={{ width: `${(n / total) * 100}%`, background: st.color }} /> : null
                            })}
                          </div>
                          <div className="biz-pipe-note">
                            {total} applicant{total === 1 ? '' : 's'}{total > 0 ? ` · ${shortlisted} shortlisted` : ''}
                          </div>
                        </td>
                        <td><span className={`biz-score ${scoreClass(s?.top)}`}>{s?.top ?? '–'}</span></td>
                        <td>
                          {s?.recent ? <span className="biz-chip solid">+{s.recent}</span> : <span className="biz-faint">0</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="biz-legend">
              {STAGES.map((st) => (
                <span key={st.key}><i style={{ background: st.color }} />{st.label}</span>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
