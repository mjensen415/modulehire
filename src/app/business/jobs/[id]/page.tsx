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

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  new: { label: 'New', color: 'var(--text3)', bg: 'var(--bg3)' },
  reviewing: { label: 'Reviewing', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  shortlisted: { label: 'Shortlisted', color: '#1d9e75', bg: 'rgba(29,158,117,0.10)' },
  interviewing: { label: 'Interviewing', color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)' },
  offered: { label: 'Offered', color: '#10b981', bg: 'rgba(16,185,129,0.10)' },
  rejected: { label: 'Rejected', color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
}

const FILTER_TABS: Array<{ key: 'all' | Status; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'interviewing', label: 'Interviewing' },
]

function scoreColor(score: number) {
  if (score >= 80) return '#1d9e75'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
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
      if (a.has_dealbreaker !== b.has_dealbreaker) return a.has_dealbreaker ? 1 : -1
      const scoreA = a.overall_score ?? -1
      const scoreB = b.overall_score ?? -1
      if (scoreA !== scoreB) return scoreB - scoreA
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', margin: '-40px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <h1 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          {job?.title ?? 'Loading…'}
        </h1>
        {job && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, color: 'var(--teal)', background: 'var(--teal-dim)', textTransform: 'capitalize' }}>
            {job.status}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <input ref={fileInputRef} type="file" accept=".pdf,.docx" onChange={handleFileUpload} style={{ display: 'none' }} />
          <button className="btn-ghost" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <input ref={csvInputRef} type="file" accept=".csv" onChange={handleCsvUpload} style={{ display: 'none' }} />
          <button className="btn-primary" onClick={() => csvInputRef.current?.click()} disabled={csvUploading}>
            {csvUploading ? 'Processing…' : 'CSV upload'}
          </button>
        </div>
      </div>

      {toast && (
        <div style={{ padding: '8px 24px', background: 'var(--teal-dim)', color: 'var(--teal)', fontSize: 12.5, fontWeight: 600 }}>
          {toast}
        </div>
      )}
      {error && (
        <div style={{ padding: '8px 24px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 12.5, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT — applicant list */}
        <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
            <input
              className="form-input"
              placeholder="Search applicants…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ fontSize: 12.5, padding: '8px 12px', marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 20,
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
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {listLoading ? (
              <div style={{ padding: 16 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ height: 54, background: 'var(--bg2)', borderRadius: 8, marginBottom: 8 }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 12.5, color: 'var(--text3)' }}>
                No applicants yet.
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
                      padding: '10px 14px',
                      borderLeft: `2px solid ${selected ? 'var(--teal)' : 'transparent'}`,
                      background: selected ? 'var(--bg2)' : 'transparent',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.name || 'Unnamed'}
                      </span>
                      {a.has_dealbreaker && <span title="Dealbreaker criteria not met" style={{ color: '#ef4444', fontSize: 11 }}>⚠</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }}>
                      {a.parsed_headline || (a.scored_at ? '—' : 'Scoring…')}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {a.overall_score != null ? (
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: scoreColor(a.overall_score) }}>{a.overall_score}</span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>Scoring…</span>
                      )}
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, color: statusCfg.color, background: statusCfg.bg }}>
                        {statusCfg.label}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* CENTER — resume */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {!selectedId ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 13.5 }}>
              Select an applicant to review their resume
            </div>
          ) : detailLoading || !detail ? (
            <div style={{ color: 'var(--text3)', fontSize: 13.5 }}>Loading…</div>
          ) : (
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
                {detail.name || 'Unnamed applicant'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>{detail.email || 'No email'}</div>
              {detail.parsed_headline && (
                <div style={{ fontSize: 13, color: 'var(--teal)', marginBottom: 16 }}>{detail.parsed_headline}</div>
              )}
              <div style={{ borderTop: '1px solid var(--border)', marginBottom: 16 }} />
              <pre style={{
                whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.7,
                color: 'var(--text2)', margin: 0,
              }}>
                {detail.raw_text || 'No resume text available.'}
              </pre>
            </div>
          )}
        </div>

        {/* RIGHT — scoring breakdown */}
        <div style={{ width: 220, flexShrink: 0, borderLeft: '1px solid var(--border)', overflowY: 'auto', padding: 16 }}>
          {!detail ? (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>—</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                {detail.overall_score != null ? (
                  <ScoreGauge score={detail.overall_score} size="sm" showLabel={false} />
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Scoring in progress…</div>
                )}
              </div>

              {detail.has_dealbreaker && (
                <div style={{
                  background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 11.5, fontWeight: 600,
                  padding: '8px 10px', borderRadius: 8, marginBottom: 14, textAlign: 'center',
                }}>
                  ⚠ Dealbreaker criteria not met
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                {detail.criteria_scores.map((cs) => {
                  const score = cs.score ?? 0
                  const expanded = expandedEvidence.has(cs.criterion_id)
                  return (
                    <div key={cs.criterion_id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>{cs.label}</span>
                        {cs.weight === 'dealbreaker' && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#ef4444' }}>DEALBREAKER</span>
                        )}
                      </div>
                      <div style={{ height: 5, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
                        <div style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: '100%', background: scoreColor(score) }} />
                      </div>
                      {cs.evidence && (
                        <div
                          onClick={() => toggleEvidence(cs.criterion_id)}
                          style={{
                            fontSize: 11, fontStyle: 'italic', color: 'var(--text3)', cursor: 'pointer',
                            display: '-webkit-box',
                            WebkitLineClamp: expanded ? 'unset' : 2,
                            WebkitBoxOrient: 'vertical',
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

              <label className="form-label">Status</label>
              <select
                value={detail.status}
                onChange={(e) => handleStatusChange(e.target.value as Status)}
                style={{
                  width: '100%', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8,
                  padding: '8px 10px', fontSize: 12.5, fontFamily: 'var(--font)', color: 'var(--text)',
                  marginBottom: 20, cursor: 'pointer',
                }}
              >
                {(Object.keys(STATUS_CONFIG) as Status[]).map((s) => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>

              <label className="form-label">Notes</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                {detail.notes.map((note) => (
                  <div key={note.id} style={{ background: 'var(--bg2)', borderRadius: 8, padding: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>{timeAgo(note.created_at)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{note.body}</div>
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
                style={{ fontSize: 12, marginBottom: 8, resize: 'vertical' }}
              />
              <button className="btn-ghost" onClick={handleAddNote} disabled={savingNote || !noteText.trim()} style={{ width: '100%', justifyContent: 'center' }}>
                {savingNote ? 'Saving…' : 'Add note'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
