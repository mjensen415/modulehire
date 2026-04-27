'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ScoreChip } from '@/components/ScoreGauge'

type Resume = {
  id: string
  title: string | null
  created_at: string
  positioning_variant: string | null
  status: string | null
  jd_id: string | null
  company: string | null
  role_type: string | null
  ats_score: number | null
}

const STATUSES = ['draft', 'sent', 'viewed', 'interview', 'offer', 'rejected'] as const
type Status = typeof STATUSES[number]

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Draft',     color: 'var(--text3)',  bg: 'var(--bg3)' },
  sent:      { label: 'Sent',      color: 'var(--teal)',   bg: 'var(--teal-dim)' },
  viewed:    { label: 'Viewed',    color: 'var(--amber)',  bg: 'var(--amber-dim)' },
  interview: { label: 'Interview', color: 'var(--indigo)', bg: 'var(--indigo-dim)' },
  offer:     { label: 'Offer',     color: 'var(--green)',  bg: 'var(--green-dim)' },
  rejected:  { label: 'Rejected',  color: 'var(--rose)',   bg: 'oklch(0.4 0.18 10 / 0.12)' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusBadge({ status, onChange }: { status: Status; onChange: (s: Status) => void }) {
  const [open, setOpen] = useState(false)
  const cfg = STATUS_CONFIG[status]

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        style={{
          background: cfg.bg,
          color: cfg.color,
          border: `1px solid ${cfg.color}`,
          borderRadius: 20,
          padding: '3px 10px',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'var(--font)',
          cursor: 'pointer',
          letterSpacing: '0.03em',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {cfg.label}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1 3l3 3 3-3" />
        </svg>
      </button>

      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
            background: 'var(--surface)', border: '1px solid var(--border2)',
            borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            minWidth: 140, overflow: 'hidden',
          }}>
            {STATUSES.map(s => {
              const c = STATUS_CONFIG[s]
              return (
                <button
                  key={s}
                  onClick={e => { e.stopPropagation(); onChange(s); setOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', textAlign: 'left',
                    padding: '9px 14px',
                    background: s === status ? 'var(--bg3)' : 'none',
                    border: 'none', cursor: 'pointer',
                    fontSize: 12, fontFamily: 'var(--font)',
                    color: c.color,
                    fontWeight: s === status ? 700 : 400,
                  }}
                  onMouseEnter={e => { if (s !== status) e.currentTarget.style.background = 'var(--bg3)' }}
                  onMouseLeave={e => { if (s !== status) e.currentTarget.style.background = 'none' }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: c.color, flexShrink: 0,
                  }} />
                  {c.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default function ApplicationsPage() {
  const [resumes, setResumes] = useState<Resume[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Status | 'all'>('all')

  useEffect(() => {
    fetch('/api/my-resumes')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        const mapped: Resume[] = (data.resumes ?? []).map((r: {
          id: string
          title: string | null
          created_at: string
          positioning_variant: string | null
          status: string | null
          job_descriptions: { extracted_company: string | null; extracted_role_type: string | null } | null
          jd_id?: string | null
          ats_score?: number | null
        }) => ({
          id: r.id,
          title: r.title,
          created_at: r.created_at,
          positioning_variant: r.positioning_variant,
          status: r.status ?? 'draft',
          jd_id: r.jd_id ?? null,
          company: r.job_descriptions?.extracted_company ?? null,
          role_type: r.job_descriptions?.extracted_role_type ?? null,
          ats_score: r.ats_score ?? null,
        }))
        setResumes(mapped)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function updateStatus(id: string, status: Status) {
    // Optimistic update
    setResumes(rs => rs.map(r => r.id === id ? { ...r, status } : r))
    try {
      const res = await fetch(`/api/resumes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
    } catch (e) {
      // Revert on failure
      setError((e as Error).message)
      fetch('/api/my-resumes').then(r => r.json()).then(data => {
        if (!data.error) setResumes(data.resumes ?? [])
      })
    }
  }

  const displayed = filter === 'all' ? resumes : resumes.filter(r => (r.status ?? 'draft') === filter)

  // Count by status for the filter bar
  const counts = resumes.reduce<Record<string, number>>((acc, r) => {
    const s = r.status ?? 'draft'
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Applications</span>
          <span className="topbar-sub">— Track your progress</span>
        </div>
        <div className="topbar-actions">
          <Link href="/generate" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontSize: 13 }}>
            + New resume
          </Link>
        </div>
      </div>

      <div className="dash-content">
        {error && (
          <div style={{ background: 'oklch(0.4 0.18 10 / 0.15)', border: '1px solid var(--rose)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--rose)', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
        )}

        {!loading && resumes.length === 0 && (
          <div className="section-card">
            <div style={{ padding: '56px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>No applications yet</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24, maxWidth: 340, margin: '0 auto 24px' }}>
                Generate a tailored resume and track it from draft through to offer right here.
              </div>
              <Link href="/generate" className="btn-primary" style={{ display: 'inline-flex', textDecoration: 'none' }}>
                Generate first resume →
              </Link>
            </div>
          </div>
        )}

        {!loading && resumes.length > 0 && (
          <>
            {/* Summary chips */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <button
                onClick={() => setFilter('all')}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontFamily: 'var(--font)',
                  background: filter === 'all' ? 'var(--teal-dim)' : 'var(--surface)',
                  border: `1px solid ${filter === 'all' ? 'var(--teal-glow)' : 'var(--border2)'}`,
                  color: filter === 'all' ? 'var(--teal)' : 'var(--text3)',
                  cursor: 'pointer', fontWeight: filter === 'all' ? 700 : 400,
                }}
              >
                All ({resumes.length})
              </button>
              {STATUSES.filter(s => counts[s]).map(s => {
                const cfg = STATUS_CONFIG[s]
                const active = filter === s
                return (
                  <button
                    key={s}
                    onClick={() => setFilter(s)}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, fontFamily: 'var(--font)',
                      background: active ? cfg.bg : 'var(--surface)',
                      border: `1px solid ${active ? cfg.color : 'var(--border2)'}`,
                      color: active ? cfg.color : 'var(--text3)',
                      cursor: 'pointer', fontWeight: active ? 700 : 400,
                    }}
                  >
                    {cfg.label} ({counts[s]})
                  </button>
                )
              })}
            </div>

            {/* Table */}
            <div className="section-card">
              {/* Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 160px 90px 130px 120px 80px',
                padding: '10px 20px',
                borderBottom: '1px solid var(--border2)',
                fontSize: 11,
                fontFamily: 'var(--mono)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text3)',
              }}>
                <span>Resume / Role</span>
                <span>Company</span>
                <span>Score</span>
                <span>Date</span>
                <span>Status</span>
                <span></span>
              </div>

              {displayed.length === 0 && (
                <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
                  No resumes with status &ldquo;{STATUS_CONFIG[filter as Status]?.label}&rdquo;
                </div>
              )}

              {displayed.map((r, i) => {
                const status = (r.status ?? 'draft') as Status
                return (
                  <div
                    key={r.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 160px 90px 130px 120px 80px',
                      padding: '14px 20px',
                      alignItems: 'center',
                      borderBottom: i < displayed.length - 1 ? '1px solid var(--border2)' : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg3)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    {/* Title */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                        {r.title || 'Untitled resume'}
                      </div>
                      {r.role_type && (
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.role_type}
                        </div>
                      )}
                    </div>

                    {/* Company */}
                    <div style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.company ?? '—'}
                    </div>

                    {/* Score */}
                    <div>
                      <ScoreChip score={r.ats_score} />
                    </div>

                    {/* Date */}
                    <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                      {formatDate(r.created_at)}
                    </div>

                    {/* Status */}
                    <div>
                      <StatusBadge status={status} onChange={s => updateStatus(r.id, s)} />
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <Link
                        href="/generate"
                        style={{ fontSize: 11, color: 'var(--text3)', textDecoration: 'none', padding: '4px 8px', border: '1px solid var(--border2)', borderRadius: 6, fontFamily: 'var(--mono)' }}
                        title="Generate new variant"
                      >
                        ↺
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pipeline summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginTop: 16 }}>
              {STATUSES.map(s => {
                const cfg = STATUS_CONFIG[s]
                const n = counts[s] ?? 0
                return (
                  <div
                    key={s}
                    onClick={() => setFilter(s === filter ? 'all' : s)}
                    style={{
                      background: 'var(--surface)', border: `1px solid ${n > 0 ? cfg.color + '66' : 'var(--border2)'}`,
                      borderRadius: 10, padding: '12px 16px', cursor: n > 0 ? 'pointer' : 'default',
                      opacity: n > 0 ? 1 : 0.4,
                    }}
                  >
                    <div style={{ fontSize: 22, fontWeight: 800, color: n > 0 ? cfg.color : 'var(--text3)', letterSpacing: '-0.02em' }}>{n}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}>{cfg.label.toUpperCase()}</div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}
