'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

type TopCandidate = { id: string; name: string | null; overall_score: number | null }
type JobStat = {
  job_id: string
  title: string
  status: string
  applicant_count: number
  scored_count: number
  avg_score: number | null
  top_3_candidates: TopCandidate[]
}
type CriteriaPassRate = { criterion_id: string; label: string; weight: string; pass_rate: number; total_scored: number }
type ScoreDistribution = { A: number; B: number; C: number; D: number }
type Totals = { total_applicants: number; total_scored: number; total_jobs_open: number; avg_score: number | null }

type Analytics = {
  jobs: JobStat[]
  criteria_pass_rates: CriteriaPassRate[]
  score_distribution: ScoreDistribution
  totals: Totals
  generated_at: string
}

const BUCKET_COLOR: Record<keyof ScoreDistribution, string> = {
  A: 'var(--teal)',
  B: 'var(--amber)',
  C: 'var(--indigo)',
  D: 'var(--text3)',
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  draft: { color: 'var(--text3)', bg: 'var(--bg3)' },
  active: { color: 'var(--teal)', bg: 'var(--teal-dim)' },
  paused: { color: 'var(--amber)', bg: 'var(--amber-dim)' },
  closed: { color: 'var(--text3)', bg: 'var(--bg3)' },
}

function passRateColor(rate: number): string {
  if (rate < 40) return '#ef4444'
  if (rate < 70) return 'var(--amber)'
  return 'var(--teal)'
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function BusinessAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [orgId, setOrgId] = useState<string | null>(null)

  const load = useCallback(async (org: string, isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true)
    setError('')
    try {
      const res = await fetch(`/api/business/analytics?org_id=${org}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not load analytics')
      setData(json)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetch('/api/business/organizations')
      .then((r) => r.json())
      .then((json) => {
        const org = json.orgs?.[0]
        if (!org) {
          setLoading(false)
          return
        }
        setOrgId(org.id)
        load(org.id, false)
      })
      .catch(() => setLoading(false))
  }, [load])

  const totalScoreCount = data
    ? data.score_distribution.A + data.score_distribution.B + data.score_distribution.C + data.score_distribution.D
    : 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Analytics
        </h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {data && (
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>
              Last updated {formatTime(data.generated_at)}
            </span>
          )}
          <button
            className="btn-ghost"
            onClick={() => orgId && load(orgId, true)}
            disabled={!orgId || refreshing}
            style={{ fontSize: 12.5, padding: '6px 12px' }}
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#ef4444', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13.5 }}>Loading…</div>
      ) : !data || data.jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border2)', borderRadius: 12 }}>
          <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
            No jobs yet — analytics will show up once you post a job and start scoring applicants.
          </p>
          <Link href="/business/jobs/new" className="btn-primary" style={{ display: 'inline-flex', textDecoration: 'none' }}>
            + Create a job posting
          </Link>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-label">Open jobs</div>
              <div className="stat-value">{data.totals.total_jobs_open}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total applicants</div>
              <div className="stat-value">{data.totals.total_applicants}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Scored</div>
              <div className="stat-value">{data.totals.total_scored}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg score</div>
              <div className="stat-value">{data.totals.avg_score ?? '—'}</div>
            </div>
          </div>

          {/* Per-job table */}
          <div className="section-card" style={{ marginBottom: 20 }}>
            <div className="section-head">
              <div className="section-head-title">Jobs</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 640 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', padding: '8px 20px',
                  borderBottom: '1px solid var(--border)', fontSize: 10.5, fontWeight: 700,
                  color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  <div style={{ flex: 1 }}>Job title</div>
                  <div style={{ width: 80 }}>Status</div>
                  <div style={{ width: 90, textAlign: 'right' }}>Applicants</div>
                  <div style={{ width: 70, textAlign: 'right' }}>Scored</div>
                  <div style={{ width: 80, textAlign: 'right' }}>Avg score</div>
                  <div style={{ width: 160, textAlign: 'right' }}>Top candidate</div>
                </div>
                {data.jobs.map((job) => {
                  const statusCfg = STATUS_COLORS[job.status] ?? STATUS_COLORS.draft
                  const top = job.top_3_candidates[0]
                  return (
                    <div
                      key={job.job_id}
                      style={{
                        display: 'flex', alignItems: 'center', padding: '12px 20px',
                        borderBottom: '1px solid var(--border)', fontSize: 13,
                      }}
                    >
                      <div style={{ flex: 1, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
                        {job.title}
                      </div>
                      <div style={{ width: 80 }}>
                        <span style={{
                          fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                          color: statusCfg.color, background: statusCfg.bg, textTransform: 'capitalize',
                        }}>
                          {job.status}
                        </span>
                      </div>
                      <div style={{ width: 90, textAlign: 'right', color: 'var(--text2)' }}>{job.applicant_count}</div>
                      <div style={{ width: 70, textAlign: 'right', color: 'var(--text2)' }}>{job.scored_count}</div>
                      <div style={{ width: 80, textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>
                        {job.avg_score ?? '—'}
                      </div>
                      <div style={{ width: 160, textAlign: 'right' }}>
                        {top ? (
                          <Link
                            href={`/business/jobs/${job.job_id}`}
                            style={{ fontSize: 12.5, color: 'var(--teal)', textDecoration: 'none', fontWeight: 600 }}
                          >
                            {top.name || 'Unnamed'} ({top.overall_score ?? '—'}) →
                          </Link>
                        ) : (
                          <span style={{ fontSize: 12.5, color: 'var(--text3)' }}>—</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Score distribution */}
          <div className="section-card" style={{ marginBottom: 20 }}>
            <div className="section-head">
              <div className="section-head-title">Candidate pipeline</div>
            </div>
            <div style={{ padding: '20px' }}>
              {totalScoreCount === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>No scored applicants yet.</div>
              ) : (
                <svg width="100%" height={120} viewBox="0 0 400 120" preserveAspectRatio="none" style={{ display: 'block' }}>
                  {(['A', 'B', 'C', 'D'] as const).map((bucket, i) => {
                    const count = data.score_distribution[bucket]
                    const pct = totalScoreCount > 0 ? (count / totalScoreCount) * 100 : 0
                    const barWidth = Math.max(pct * 3.6, count > 0 ? 4 : 0)
                    const y = i * 30
                    return (
                      <g key={bucket}>
                        <text x={0} y={y + 14} fontSize={11} fill="var(--text2)" fontWeight={700}>{bucket}</text>
                        <rect x={20} y={y + 4} width={360} height={14} rx={4} fill="var(--bg3)" />
                        <rect x={20} y={y + 4} width={barWidth} height={14} rx={4} fill={BUCKET_COLOR[bucket]} />
                        <text x={385} y={y + 14} fontSize={11} fill="var(--text2)" textAnchor="end">
                          {count} ({Math.round(pct)}%)
                        </text>
                      </g>
                    )
                  })}
                </svg>
              )}
            </div>
          </div>

          {/* Criteria difficulty */}
          <div className="section-card">
            <div className="section-head">
              <div className="section-head-title">Criteria difficulty</div>
            </div>
            {data.criteria_pass_rates.length === 0 ? (
              <div style={{ padding: '20px', fontSize: 13, color: 'var(--text3)' }}>
                No scored criteria yet.
              </div>
            ) : (
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', padding: '8px 20px',
                  borderBottom: '1px solid var(--border)', fontSize: 10.5, fontWeight: 700,
                  color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  <div style={{ flex: 1 }}>Criterion</div>
                  <div style={{ width: 100 }}>Weight</div>
                  <div style={{ width: 100, textAlign: 'right' }}>Pass rate</div>
                </div>
                {data.criteria_pass_rates.map((c) => (
                  <div
                    key={c.criterion_id}
                    style={{
                      display: 'flex', alignItems: 'center', padding: '10px 20px',
                      borderBottom: '1px solid var(--border)', fontSize: 13,
                    }}
                  >
                    <div style={{ flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
                      {c.label}
                    </div>
                    <div style={{ width: 100, fontSize: 11.5, color: 'var(--text3)', textTransform: 'capitalize' }}>
                      {c.weight.replace('_', ' ')}
                    </div>
                    <div style={{ width: 100, textAlign: 'right', fontWeight: 700, color: passRateColor(c.pass_rate) }}>
                      {c.pass_rate}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
