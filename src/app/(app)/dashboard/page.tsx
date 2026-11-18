import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveProfileId } from '@/lib/profile'
import { KIND_LABELS, type DocumentKind } from '@/lib/documents'
import ReviewQueue from '@/components/ReviewQueue'
import HomeHeader from './HomeHeader'
import TodaySteps from './TodaySteps'
import McpPromoCard from './McpPromoCard'
import '@/app/warm.css'
import './home.css'

// Today home: what's next, at a glance. Replaces the old dashboard (same route; many redirects
// and links point at /dashboard).

const STAGE_LABEL: Record<string, string> = {
  saved: 'Saved', applied: 'Applied', screening: 'Screening', interviewing: 'Interviewing',
  offered: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn', no_response: 'No response',
}
const CLOSED = ['rejected', 'withdrawn', 'no_response']
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
const word = (n: number) => WORDS[n] ?? String(n)
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const { data: me } = await supabase.from('users').select('name, onboarding_complete').eq('id', user.id).single()
  if (!me?.onboarding_complete) redirect('/onboarding')

  const profileId = await getActiveProfileId(supabase, user.id)
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const weekOut = new Date(now.getTime() + 7 * 86_400_000).toISOString()
  const moduleCount = (status?: string) => {
    let q = supabase.from('modules').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('deleted_at', null)
    if (status) q = q.eq('status', status)
    if (profileId) q = q.eq('profile_id', profileId)
    return q
  }

  const [tracking, appliedMonth, upcoming, thisWeek, confirmed, drafts, anyModules, recentApps, nextInterviews, docs, tailored, jdCount] = await Promise.all([
    supabase.from('job_applications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).not('status', 'in', `(${CLOSED.join(',')})`),
    supabase.from('job_applications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('applied_at', monthStart),
    supabase.from('interviews').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('scheduled_at', now.toISOString()),
    supabase.from('interviews').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('scheduled_at', now.toISOString()).lte('scheduled_at', weekOut),
    moduleCount('confirmed'),
    moduleCount('draft'),
    moduleCount(),
    supabase.from('job_applications').select('id, company, title, status, job_description_id, updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(3),
    supabase.from('interviews').select('id, round_name, scheduled_at, format, job_applications(company, title)').eq('user_id', user.id).gte('scheduled_at', now.toISOString()).order('scheduled_at', { ascending: true }).limit(2),
    supabase.from('documents').select('id, kind, filename, period_label, created_at').eq('user_id', user.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(3),
    supabase.from('generated_resumes').select('id, title, created_at').eq('user_id', user.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(3),
    supabase.from('job_descriptions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('deleted_at', null),
  ])
  // interviews arrives with the Interviews feature; a missing table reads as none.
  const upcomingCount = upcoming.error ? 0 : upcoming.count ?? 0
  const weekCount = thisWeek.error ? 0 : thisWeek.count ?? 0
  const draftCount = drafts.count ?? 0
  const firstName = (me?.name ?? '').trim().split(/\s+/)[0] || null

  // Fit for the job rows: the JD's cached match report score.
  const apps = recentApps.data ?? []
  const jdIds = apps.map(a => a.job_description_id).filter(Boolean) as string[]
  const { data: jdRows } = jdIds.length
    ? await supabase.from('job_descriptions').select('id, match_report').in('id', jdIds)
    : { data: [] as Array<{ id: string; match_report: { overall?: number } | null }> }
  const fitByJd = new Map((jdRows ?? []).map(j => [j.id, typeof j.match_report?.overall === 'number' ? j.match_report.overall : null]))

  const files = [
    ...(docs.data ?? []).map(d => ({ id: d.id, name: d.filename || d.period_label || 'Document', kind: KIND_LABELS[d.kind as DocumentKind] ?? 'Document', created_at: d.created_at, href: null as string | null })),
    ...(tailored.data ?? []).map(r => ({ id: r.id, name: r.title || 'Tailored resume', kind: 'Tailored resume', created_at: r.created_at, href: `/resumes/${r.id}` })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3)

  const summary = weekCount > 0
    ? `${word(weekCount)} ${plural(weekCount, 'interview')} this week. Here's what's next.`
    : draftCount > 0
      ? `${word(Math.min(draftCount, 99))} new ${plural(draftCount, 'module')} waiting for you. Here's what's next.`
      : (appliedMonth.count ?? 0) > 0
        ? `${word(appliedMonth.count ?? 0)} ${plural(appliedMonth.count ?? 0, 'application')} out this month. Here's what's next.`
        : "Here's what's next."

  const brandNew = (anyModules.count ?? 0) === 0 && (docs.data ?? []).length === 0 && (tracking.count ?? 0) === 0 && (jdCount.count ?? 0) === 0

  return (
    <div className="home warm">
      <div className="home-inner">
        <HomeHeader firstName={firstName} summary={brandNew ? "Let's build your library first." : summary} />

        {brandNew ? (
          <section className="home-empty">
            <h2>Upload your resume</h2>
            <p>
              We turn it into small, reusable modules, one per accomplishment. You confirm each one, and every tailored
              resume is built only from what you confirmed.
            </p>
            <div className="home-empty-actions">
              <Link href="/upload" className="home-btn">Upload your resume</Link>
              <Link href="/upload?kind=performance_review" className="home-panel-link">or a performance review</Link>
            </div>
          </section>
        ) : (
          <>
            <section className="home-stats" aria-label="At a glance">
              <Link href="/job-tracker" className="home-stat"><span className="home-stat-value">{tracking.count ?? 0}</span><span className="home-stat-label">Jobs you&apos;re tracking</span></Link>
              <Link href="/job-tracker" className="home-stat"><span className="home-stat-value">{appliedMonth.count ?? 0}</span><span className="home-stat-label">Applied this month</span></Link>
              <Link href="/interviews" className="home-stat"><span className="home-stat-value">{upcomingCount}</span><span className="home-stat-label">Interviews coming up</span></Link>
              <Link href="/library" className="home-stat"><span className="home-stat-value">{confirmed.count ?? 0}</span><span className="home-stat-label">Confirmed modules</span></Link>
            </section>

            <section className="home-today">
              <h2 className="home-section-title">Today&apos;s three</h2>
              <TodaySteps />
            </section>

            <div className="home-panels">
              <section className="home-panel">
                <div className="home-panel-head">
                  <h2 className="home-panel-title">Jobs</h2>
                  <Link href="/job-tracker" className="home-panel-link">All jobs</Link>
                </div>
                {apps.length === 0 ? (
                  <p className="home-panel-empty">No jobs tracked yet. <Link href="/generate" className="home-panel-link">Paste a job posting</Link></p>
                ) : (
                  <ul className="home-rows">
                    {apps.map(a => {
                      const fit = a.job_description_id ? fitByJd.get(a.job_description_id) ?? null : null
                      return (
                        <li key={a.id}>
                          <Link href={a.job_description_id ? `/matches/${a.job_description_id}` : '/job-tracker'} className="home-row">
                            <div className="home-row-main">
                              <div className="home-row-title">{a.title || 'Untitled role'}</div>
                              <div className="home-row-sub">{a.company}</div>
                            </div>
                            {fit !== null && (
                              <div className="home-fit" title={`Fit ${fit}%`}>
                                <div className="home-fit-bar"><span style={{ width: `${Math.max(4, Math.min(100, fit))}%` }} /></div>
                                <span className="home-fit-num">{fit}% fit</span>
                              </div>
                            )}
                            <span className="home-chip">{STAGE_LABEL[a.status] ?? a.status}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section className="home-panel">
                <div className="home-panel-head">
                  <h2 className="home-panel-title">Library, to review</h2>
                  <Link href="/library#review" className="home-panel-link">{draftCount > 0 ? `All ${draftCount}` : 'Library'}</Link>
                </div>
                {draftCount === 0 ? (
                  <p className="home-panel-empty">Nothing waiting. {confirmed.count ?? 0} confirmed {plural(confirmed.count ?? 0, 'module')} in your library.</p>
                ) : (
                  <ReviewQueue limit={2} compact />
                )}
              </section>

              <section className="home-panel">
                <div className="home-panel-head">
                  <h2 className="home-panel-title">Interviews</h2>
                  <Link href="/interviews" className="home-panel-link">All interviews</Link>
                </div>
                {(nextInterviews.error || (nextInterviews.data ?? []).length === 0) ? (
                  <p className="home-panel-empty">No interviews scheduled. When you land one, <Link href="/interviews" className="home-panel-link">add the round</Link> and we&apos;ll help you prep.</p>
                ) : (
                  <ul className="home-rows">
                    {(nextInterviews.data ?? []).map(iv => {
                      const app = Array.isArray(iv.job_applications) ? iv.job_applications[0] : iv.job_applications
                      return (
                        <li key={iv.id}>
                          <Link href={`/interviews/${iv.id}`} className="home-row">
                            <div className="home-row-main">
                              <div className="home-row-title">{iv.round_name}{app?.company ? ` · ${app.company}` : ''}</div>
                              <div className="home-row-sub">{iv.scheduled_at ? shortDate(iv.scheduled_at) : 'Date not set'}{iv.format ? ` · ${iv.format}` : ''}</div>
                            </div>
                            <span className="home-chip">Prep</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section className="home-panel">
                <div className="home-panel-head">
                  <h2 className="home-panel-title">Files</h2>
                  <Link href="/files" className="home-panel-link">All files</Link>
                </div>
                {files.length === 0 ? (
                  <p className="home-panel-empty">Your uploads and tailored resumes will show up here.</p>
                ) : (
                  <ul className="home-rows">
                    {files.map(f => {
                      const inner = (
                        <>
                          <div className="home-row-main">
                            <div className="home-row-title">{f.name}</div>
                            <div className="home-row-sub">{shortDate(f.created_at)}</div>
                          </div>
                          <span className="home-chip">{f.kind}</span>
                        </>
                      )
                      return (
                        <li key={f.id}>
                          <Link href={f.href ?? '/files'} className="home-row">{inner}</Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>

            <McpPromoCard />
          </>
        )}
      </div>
    </div>
  )
}
