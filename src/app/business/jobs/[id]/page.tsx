'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import ScoreGauge from '@/components/ScoreGauge'

type Applicant = {
  id: string
  name: string | null
  email: string | null
  parsed_headline: string | null
  overall_score: number | null
  has_dealbreaker: boolean
  status: Status
  scored_at: string | null
  created_at: string
}

type CriterionScore = {
  criterion_id: string
  label: string | null
  weight: string | null
  score: number | null
  met: boolean | null
  evidence: string | null
}

type Note = { id: string; body: string; user_id: string; created_at: string }

type ApplicantDetail = Applicant & {
  raw_text: string | null
  criteria_scores: CriterionScore[]
  notes: Note[]
}

type Job = { id: string; title: string; status: string }

type Status = 'new' | 'reviewing' | 'shortlisted' | 'interviewing' | 'offered' | 'rejected'
type SortKey = 'score' | 'name' | 'date'

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  new:         { label: 'New',         color: 'var(--text3)',     bg: 'var(--bg3)' },
  reviewing:   { label: 'Reviewing',   color: '#3b82f6',         bg: 'rgba(59,130,246,0.1)' },
  shortlisted: { label: 'Shortlisted', color: '#1d9e75',         bg: 'rgba(29,158,117,0.10)' },
  interviewing:{ label: 'Interviewing',color: '#8b5cf6',         bg: 'rgba(139,92,246,0.10)' },
  offered:     { label: 'Offered',     color: '#10b981',         bg: 'rgba(16,185,129,0.10)' },
  rejected:    { label: 'Rejected',    color: '#ef4444',         bg: 'rgba(239,68,68,0.10)' },
}

const FILTER_TABS: Array<{ key: 'all' | Status; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'interviewing', label: 'Interviewing' },
]

const WEIGHT_COLOR: Record<string, string> = {
  dealbreaker:  '#ef4444',
  must_have:    'var(--teal)',
  nice_to_have: 'var(--text3)',
}

function scoreColor(score: number) {
  if (score >= 80) return '#1d9e75'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
}

function scoreBg(score: number) {
  if (score >= 80) return 'rgba(29,158,117,0.12)'
  if (score >= 60) return 'rgba(245,158,11,0.12)'
  return 'rgba(239,68,68,0.12)'
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

// Formats raw resume text into sections with better readability
function ResumeDisplay({ text, name, email, headline }: {
  text: string | null
  name: string | null
  email: string | null
  headline: string | null
}) {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 2 }}>
          {name || 'Unnamed applicant'}
        </div>
        {email && (
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 6 }}>{email}</div>
        )}
        {headline && (
          <div style={{ fontSize: 13.5, color: 'var(--teal)', fontWeight: 600 }}>{headline}</div>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
        {text ? (
          <div style={{
            fontSize: 13,
            lineHeight: 1.75,
            color: 'var(--text2)',
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            wordBreak: 'break-word',
          }}>
            {text}
          </div>
        ) : (
          <div style={{ color: 'var(--text3)', fontSize: 13.5 }}>No resume text available.</div>
        )}
      </div>
    </div>
  )
}

export default function JobWorkspacePage() {
  const params = useParams<{ id: string }>()
  const jobId = params.id

  const [job, setJob] = useState<Job | null>(null)
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ApplicantDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [csvUploading, setCsvUploading] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [toast, setToast] = useState('')
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const loadApplicants = useCallback(async () => {
    try {
      const res = await fetch(`/api/business/applicants?job_id=${jobId}&limit=200`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load applicants')
      setApplicants(data.applicants ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setListLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    fetch(`/api/business/job-postings/${jobId}`)
      .then((r) => r.json())
      .then((data) => { if (data.job) setJob(data.job) })
    loadApplicants()
  }, [jobId, loadApplicants])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/business/applicants/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load applicant')
      setDetail(data.applicant)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) loadDetail(selectedId)
    else setDetail(null)
  }, [selectedId, loadDetail])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('job_id', jobId)
      formData.append('file', file)
      const res = await fetch('/api/business/applicants/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not upload resume')
      await loadApplicants()
      setSelectedId(data.applicant.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('job_id', jobId)
      formData.append('file', file)
      const res = await fetch('/api/business/applicants/csv', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not process CSV')
      setToast(`Processed ${data.processed} applicant${data.processed === 1 ? '' : 's'}${data.failed ? ` — ${data.failed} failed` : ''}`)
      setTimeout(() => setToast(''), 5000)
      await loadApplicants()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCsvUploading(false)
      if (csvInputRef.current) csvInputRef.current.value = ''
    }
  }

  async function handleStatusChange(status: Status) {
    if (!detail) return
    const previous = detail.status
    setDetail({ ...detail, status })
    setApplicants((as) => as.map((a) => (a.id === detail.id ? { ...a, status } : a)))
    try {
      const res = await fetch(`/api/business/applicants/${detail.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Could not update status')
    } catch (e) {
      setDetail((d) => (d ? { ...d, status: previous } : d))
      setApplicants((as) => as.map((a) => (a.id === detail.id ? { ...a, status: previous } : a)))
      setError((e as Error).message)
    }
  }

  async function handleAddNote() {
    if (!detail || !noteText.trim() || savingNote) return
    setSavingNote(true)
    try {
      const res = await fetch(`/api/business/applicants/${detail.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteText.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not add note')
      setDetail((d) => (d ? { ...d, notes: [data.note, ...d.notes] } : d))
      setNoteText('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSavingNote(false)
    }
  }

  function toggleEvidence(criterionId: string) {
    setExpandedEvidence((prev) => {
      const next = new Set(prev)
      if (next.has(criterionId)) next.delete(criterionId)
      else next.add(criterionId)
      return next
    })
  }

  const filtered = applicants
    .filter((a) => statusFilter === 'all' || a.status === statusFilter)
    .filter((a) => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (a.name ?? '').toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (sortKey === 'score') {
        if (a.has_dealbreaker !== b.has_dealbreaker) return a.has_dealbreaker ? 1 : -1
        return (b.overall_score ?? -1) - (a.overall_score ?? -1)
      }
      if (sortKey === 'name') return (a.name ?? '').localeCompare(b.name ?? '')
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  const jobStatusCfg = STATUS_CONFIG[job?.status as Status] ?? STATUS_CONFIG.new

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', margin: '-40px' }}>

      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px',
        borderBottom: '1px solid var(--border)', flexShrink: 0, height: 52,
      }}>
        <h1 style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          {job?.title ?? '…'}
        </h1>
        {job && (
          <span style={{
            fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
            color: jobStatusCfg.color, background: jobStatusCfg.bg, textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {job.status}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <input ref={fileInputRef} type="file" accept=".pdf,.docx" onChange={handleFileUpload} style={{ display: 'none' }} />
          <button className="btn-ghost" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ fontSize: 12.5, padding: '6px 12px' }}>
            {uploading ? 'Uploading…' : '↑ Resume'}
          </button>
          <input ref={csvInputRef} type="file" accept=".csv" onChange={handleCsvUpload} style={{ display: 'none' }} />
          <button className="btn-primary" onClick={() => csvInputRef.current?.click()} disabled={csvUploading} style={{ fontSize: 12.5, padding: '6px 14px' }}>
            {csvUploading ? 'Processing…' : '↑ CSV batch'}
          </button>
        </div>
      </div>

      {/* Toasts / errors */}
      {toast && (
        <div style={{ padding: '7px 20px', background: 'var(--teal-dim)', color: 'var(--teal)', fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>
          ✓ {toast}
        </div>
      )}
      {error && (
        <div style={{ padding: '7px 20px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 12.5, fontWeight: 600, flexShrink: 0, display: 'flex', justifyContent: 'space-between' }}>
          {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>×</button>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT — applicant list (300px) */}
        <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Search + filters */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <input
              className="form-input"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ fontSize: 12.5, padding: '7px 11px', marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                    border: `1px solid ${statusFilter === tab.key ? 'var(--teal-glow)' : 'var(--border2)'}`,
                    background: statusFilter === tab.key ? 'var(--teal-dim)' : 'transparent',
                    color: statusFilter === tab.key ? 'var(--teal)' : 'var(--text3)',
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500 }}>Sort:</span>
              {(['score', 'name', 'date'] as SortKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setSortKey(k)}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                    background: sortKey === k ? 'var(--bg3)' : 'transparent',
                    border: `1px solid ${sortKey === k ? 'var(--border2)' : 'transparent'}`,
                    color: sortKey === k ? 'var(--text)' : 'var(--text3)',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {k}
                </button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>{filtered.length}</span>
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {listLoading ? (
              <div style={{ padding: 16 }}>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} style={{ height: 60, background: 'var(--bg2)', borderRadius: 8, marginBottom: 8, opacity: 1 - i * 0.2 }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text3)' }}>
                {applicants.length === 0 ? 'No applicants yet. Upload a CSV or a resume.' : 'No matches.'}
              </div>
            ) : (
              filtered.map((a) => {
                const selected = a.id === selectedId
                const statusCfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.new
                return (
                  <div
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    style={{
                      padding: '11px 14px',
                      borderLeft: `3px solid ${selected ? 'var(--teal)' : 'transparent'}`,
                      background: selected ? 'var(--bg2)' : 'transparent',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.1s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.name || 'Unnamed'}
                      </span>
                      {a.has_dealbreaker && (
                        <span title="Dealbreaker not met" style={{ color: '#ef4444', fontSize: 12, flexShrink: 0 }}>⚠</span>
                      )}
                      {a.overall_score != null ? (
                        <span style={{
                          fontSize: 12, fontWeight: 800, flexShrink: 0,
                          color: scoreColor(a.overall_score),
                          background: scoreBg(a.overall_score),
                          padding: '2px 7px', borderRadius: 6,
                        }}>
                          {a.overall_score}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10.5, color: 'var(--text3)', flexShrink: 0 }}>…</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 5 }}>
                      {a.parsed_headline || (a.email ?? '—')}
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 20, color: statusCfg.color, background: statusCfg.bg }}>
                      {statusCfg.label}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* CENTER — resume */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', minWidth: 0 }}>
          {!selectedId ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div style={{ textAlign: 'center', color: 'var(--text3)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>👤</div>
                <div style={{ fontSize: 13.5 }}>Select an applicant to review their resume</div>
              </div>
            </div>
          ) : detailLoading || !detail ? (
            <div style={{ color: 'var(--text3)', fontSize: 13.5 }}>Loading…</div>
          ) : (
            <ResumeDisplay
              text={detail.raw_text}
              name={detail.name}
              email={detail.email}
              headline={detail.parsed_headline}
            />
          )}
        </div>

        {/* RIGHT — scoring + status + notes (280px) */}
        <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {!detail ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: 20 }}>
                Select an applicant
              </div>
            </div>
          ) : (
            <>
              {/* Score overview */}
              <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
                {detail.overall_score != null ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ScoreGauge score={detail.overall_score} size="sm" showLabel={false} />
                    <div>
                      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: scoreColor(detail.overall_score), lineHeight: 1 }}>
                        {detail.overall_score}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>out of 100</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Scoring in progress…</div>
                )}
                {detail.has_dealbreaker && (
                  <div style={{
                    marginTop: 10,
                    background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 12, fontWeight: 600,
                    padding: '7px 10px', borderRadius: 7, textAlign: 'center',
                  }}>
                    ⚠ Dealbreaker not met
                  </div>
                )}
              </div>

              {/* Criteria breakdown */}
              {detail.criteria_scores.length > 0 && (
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    Score breakdown
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {detail.criteria_scores.map((cs) => {
                      const score = cs.score ?? 0
                      const expanded = expandedEvidence.has(cs.criterion_id)
                      const wColor = cs.weight ? (WEIGHT_COLOR[cs.weight] ?? 'var(--text3)') : 'var(--text3)'
                      return (
                        <div key={cs.criterion_id}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, flex: 1, lineHeight: 1.3 }}>{cs.label}</span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: scoreColor(score), flexShrink: 0 }}>{score}</span>
                          </div>
                          {/* Bar */}
                          <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                            <div style={{
                              width: `${Math.max(0, Math.min(100, score))}%`, height: '100%',
                              background: scoreColor(score), borderRadius: 3,
                              transition: 'width 0.4s ease',
                            }} />
                          </div>
                          {/* Weight badge */}
                          {cs.weight && cs.weight !== 'nice_to_have' && (
                            <div style={{ fontSize: 10, fontWeight: 700, color: wColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                              {cs.weight === 'dealbreaker' ? '⚠ ' : ''}{cs.weight.replace('_', ' ')}
                            </div>
                          )}
                          {/* Evidence */}
                          {cs.evidence && (
                            <div
                              onClick={() => toggleEvidence(cs.criterion_id)}
                              style={{
                                fontSize: 11.5, fontStyle: 'italic', color: 'var(--text3)', cursor: 'pointer',
                                lineHeight: 1.5,
                                display: expanded ? 'block' : '-webkit-box',
                                WebkitLineClamp: expanded ? undefined : 2,
                                WebkitBoxOrient: 'vertical' as const,
                                overflow: 'hidden',
                              }}
                            >
                              &ldquo;{cs.evidence}&rdquo;
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Status */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Status
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {(Object.keys(STATUS_CONFIG) as Status[]).map((s) => {
                    const cfg = STATUS_CONFIG[s]
                    const active = detail.status === s
                    return (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        style={{
                          fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 20,
                          border: `1px solid ${active ? cfg.color : 'var(--border2)'}`,
                          background: active ? cfg.bg : 'transparent',
                          color: active ? cfg.color : 'var(--text3)',
                          cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s',
                        }}
                      >
                        {cfg.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Notes */}
              <div style={{ padding: '12px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Notes
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10, flex: 1 }}>
                  {detail.notes.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>No notes yet.</div>
                  ) : detail.notes.map((note) => (
                    <div key={note.id} style={{ background: 'var(--bg2)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 4 }}>{timeAgo(note.created_at)}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>{note.body}</div>
                    </div>
                  ))}
                </div>
                <textarea
                  className="form-input"
                  placeholder="Add a note…"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  style={{ fontSize: 12.5, marginBottom: 8, resize: 'vertical' }}
                />
                <button
                  className="btn-ghost"
                  onClick={handleAddNote}
                  disabled={savingNote || !noteText.trim()}
                  style={{ width: '100%', justifyContent: 'center', fontSize: 12.5 }}
                >
                  {savingNote ? 'Saving…' : 'Add note'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
