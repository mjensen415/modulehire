'use client'

import { useState } from 'react'
import Link from 'next/link'
import { DIMENSION_LABELS, type Dimension } from '@/lib/dimensions'

export type MatchReportCriterion = {
  label: string
  dimension: Dimension
  weight: number
  score: number
  bucket: 'strong' | 'partial' | 'gap'
  why: string
  evidence: Array<{ id: string; title: string; source_company: string | null }>
}

export type MatchReportData = {
  overall: number
  criteria: MatchReportCriterion[]
  strong: string[]
  gaps: string[]
  generated_at: string
}

type JdSummary = { title: string; company: string | null; source_url?: string | null }

function scoreBarColor(score: number) {
  if (score >= 70) return 'var(--teal)'
  if (score >= 40) return 'var(--amber)'
  return 'var(--rose)'
}

function initial(text: string) {
  return text.trim().charAt(0).toUpperCase() || '?'
}

function WeightDots({ weight }: { weight: number }) {
  return (
    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} style={{ color: n <= weight ? 'var(--text)' : 'var(--border2)' }}>●</span>
      ))}
    </span>
  )
}

function ScoreBar({ score, height = 8 }: { score: number; height?: number }) {
  return (
    <div style={{ height, background: 'var(--bg3)', borderRadius: height / 2, overflow: 'hidden', flex: 1 }}>
      <div style={{
        height: '100%', width: `${Math.max(0, Math.min(100, score))}%`,
        background: scoreBarColor(score), borderRadius: height / 2, transition: 'width 0.3s',
      }} />
    </div>
  )
}

function CompanyAvatar({ company, size = 40 }: { company: string | null; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--teal-dim)', color: 'var(--teal)', border: '1px solid var(--teal-glow)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 700, fontFamily: 'var(--mono)',
    }}>
      {initial(company || '?')}
    </div>
  )
}

function ChipRow({ label, labels, dashed }: { label: string; labels: string[]; dashed?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', paddingTop: 4, minWidth: 48 }}>{label}</span>
      {labels.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text3)' }}>None yet</span>}
      {labels.map(l => (
        <span key={l} style={{
          fontSize: 11.5, padding: '3px 10px', borderRadius: 999,
          border: `1px ${dashed ? 'dashed' : 'solid'} var(--border2)`,
          color: 'var(--text2)',
        }}>{l}</span>
      ))}
    </div>
  )
}

function StatusPill({ loading }: { loading?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600,
      color: loading ? 'var(--amber)' : 'var(--teal)',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: loading ? 'var(--amber)' : 'var(--teal)',
        animation: loading ? 'mh-pulse 1.2s ease-in-out infinite' : 'none',
      }} />
      {loading ? 'Scoring…' : 'Complete'}
    </span>
  )
}

export default function MatchReport({
  report,
  jd,
  variant = 'full',
  loading = false,
  onBuildResume,
}: {
  report: MatchReportData | null
  jd: JdSummary
  variant?: 'full' | 'compact'
  loading?: boolean
  onBuildResume?: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [hideDetails, setHideDetails] = useState(false)

  const analyzedDate = report ? new Date(report.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null

  if (variant === 'compact') {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CompanyAvatar company={jd.company ?? null} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{jd.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>{jd.company}{analyzedDate ? ` · analyzed ${analyzedDate}` : ''}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div
              style={{ fontSize: 22, fontWeight: 800, color: report ? scoreBarColor(report.overall) : 'var(--text3)' }}
              title="How well your library's actual experience lines up with this job's requirements — not a keyword/ATS score"
            >
              {loading ? '…' : report ? `${report.overall}%` : '—'}
            </div>
          </div>
        </div>
        {report && (
          <>
            <div style={{ marginTop: 10 }}><ScoreBar score={report.overall} height={6} /></div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ChipRow label="Strong" labels={report.strong} />
              <ChipRow label="Gaps" labels={report.gaps} dashed />
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', overflow: 'hidden' }}>
      <style>{`@keyframes mh-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>

      <div style={{ padding: '16px 20px', borderBottom: '3px solid var(--teal)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <StatusPill loading={loading} />
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Scored by criteria</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
          <CompanyAvatar company={jd.company ?? null} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{jd.title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>{jd.company}{analyzedDate ? ` · analyzed ${analyzedDate}` : ''}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: report ? scoreBarColor(report.overall) : 'var(--text3)', lineHeight: 1 }}>
              {loading ? '—' : report ? `${report.overall}%` : '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Match score</div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}><ScoreBar score={report?.overall ?? 0} /></div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>
          Judged against this job&apos;s actual requirements, not a keyword count — your resume&apos;s ATS Estimator score measures something different (format/keyword match) and won&apos;t always agree with this.
        </div>
      </div>

      {loading && (
        <div style={{ padding: '18px 20px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 32, background: 'var(--bg3)', borderRadius: 6, marginBottom: 8, opacity: 0.5 }} />
          ))}
        </div>
      )}

      {!loading && report && !hideDetails && (
        <div style={{ padding: '16px 20px' }}>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 90px 70px 110px', gap: 10, padding: '8px 14px',
              fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.04em', textTransform: 'uppercase',
              borderBottom: '1px solid var(--border)',
            }}>
              <span>Criterion</span><span>Type</span><span>Weight</span><span>Your match</span>
            </div>
            {report.criteria.map(c => {
              const isOpen = expanded === c.label
              return (
                <div key={c.label} style={{ borderBottom: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : c.label)}
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr 90px 70px 110px', gap: 10, width: '100%',
                      padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left', alignItems: 'center', font: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.03em',
                      padding: '2px 7px', borderRadius: 5, border: '1px solid var(--border2)', color: 'var(--text3)',
                      width: 'fit-content',
                    }}>{DIMENSION_LABELS[c.dimension]}</span>
                    <WeightDots weight={c.weight} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ScoreBar score={c.score} height={6} />
                      <span style={{ fontSize: 11.5, fontFamily: 'var(--mono)', color: 'var(--text2)', width: 32, textAlign: 'right' }}>{c.score}%</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 14px 12px 14px' }}>
                      {c.why && <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 8 }}>{c.why}</div>}
                      {c.evidence.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {c.evidence.map(e => (
                            <Link key={e.id} href={`/library/${e.id}`} style={{ fontSize: 12, color: 'var(--teal)', textDecoration: 'none' }}>
                              {e.title}{e.source_company ? ` · ${e.source_company}` : ''}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text3)' }}>No matching modules in your library.</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ChipRow label="Strong" labels={report.strong} />
            <ChipRow label="Gaps" labels={report.gaps} dashed />
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {onBuildResume && (
              <button type="button" className="btn-primary" onClick={onBuildResume}>Build resume from this →</button>
            )}
            {jd.source_url && (
              <a href={jd.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: 'var(--text2)', textDecoration: 'none' }}>
                Open job posting ↗
              </a>
            )}
            <button type="button" onClick={() => setHideDetails(true)} style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Hide details ▴
            </button>
          </div>
        </div>
      )}

      {!loading && report && hideDetails && (
        <div style={{ padding: '10px 20px 16px 20px', textAlign: 'right' }}>
          <button type="button" onClick={() => setHideDetails(false)} style={{ fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Show details ▾
          </button>
        </div>
      )}
    </div>
  )
}
