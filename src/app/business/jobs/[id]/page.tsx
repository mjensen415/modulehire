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
  applicant_criterion_scores?: Array<{ criterion_id: string; score: number | null; met: boolean | null }>
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
  resume_signed_url: string | null
}

type Job = { id: string; title: string; status: string; extracted_themes: string[] }

type Status = 'new' | 'reviewing' | 'shortlisted' | 'interviewing' | 'offered' | 'rejected'
type SortKey = 'score' | 'name' | 'date'

type Weight = 'dealbreaker' | 'must_have' | 'nice_to_have'
type CriterionType = 'skill' | 'experience'
type Criterion = { key: string; id?: string; label: string; weight: Weight; description?: string; criterionType: CriterionType; minYears?: number }

const CRITERIA_WEIGHT_OPTIONS: Array<{ value: Weight; label: string; color: string; bg: string }> = [
  { value: 'dealbreaker', label: '⚠ Dealbreaker', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  { value: 'must_have', label: 'Must have', color: 'var(--teal)', bg: 'var(--teal-dim)' },
  { value: 'nice_to_have', label: 'Nice to have', color: 'var(--text3)', bg: 'var(--bg3)' },
]

let criteriaKeyCounter = 0
function nextCriteriaKey() {
  criteriaKeyCounter += 1
  return `nc${criteriaKeyCounter}`
}

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

function isCsvFile(file: File): boolean {
  return file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function csvEscape(value: string | number): string {
  const s = String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
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

function generateSummary(applicant: Applicant, criteria: Criterion[]): string {
  const scores = applicant.applicant_criterion_scores ?? []
  if (scores.length === 0 || applicant.overall_score == null) return 'Not yet scored.'

  const criteriaWithIds = criteria.filter((c) => c.id)

  const missed = criteriaWithIds.filter((c) => {
    const cs = scores.find((s) => s.criterion_id === c.id)
    if (!cs) return false
    return cs.met === false || (cs.score != null && cs.score < 50)
  })

  const dealbreakersMissed = missed.filter((c) => c.weight === 'dealbreaker')
  const mustHavesMissed = missed.filter((c) => c.weight === 'must_have')

  if (dealbreakersMissed.length > 0) {
    const labels = dealbreakersMissed.map((c) => c.label).join(', ')
    return `Dealbreaker not met: ${labels}.`
  }
  if (missed.length === 0) return 'Meets all criteria.'
  if (mustHavesMissed.length > 0 && mustHavesMissed.length <= 2) {
    return `Strong match. Missing: ${mustHavesMissed.map((c) => c.label).join(', ')}.`
  }
  const metCount = criteriaWithIds.length - missed.length
  return `Meets ${metCount} of ${criteriaWithIds.length} criteria.`
}

function CriterionDot({ applicant, criterionId, weight }: {
  applicant: Applicant
  criterionId: string
  weight: Weight
}) {
  const scores = applicant.applicant_criterion_scores
  if (!scores || scores.length === 0) {
    return <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span>
  }

  const cs = scores.find((s) => s.criterion_id === criterionId)
  if (!cs || cs.score == null) {
    return (
      <span title="Not yet scored" style={{ fontSize: 13, color: 'var(--text3)' }}>—</span>
    )
  }

  const met = cs.met === true || (cs.met == null && cs.score >= 65)
  const isDealbreakerFail = !met && weight === 'dealbreaker'
  const color = met ? '#1d9e75' : '#ef4444'
  const tooltip = isDealbreakerFail ? '⚠ Dealbreaker not met' : met ? 'Met' : 'Not met'

  return (
    <span title={tooltip} style={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1 }}>
      {met ? '✓' : '✗'}
    </span>
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
  const [jobStatusUpdating, setJobStatusUpdating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [csvUploading, setCsvUploading] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [toast, setToast] = useState('')
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [criteriaOpen, setCriteriaOpen] = useState(false)
  const [suggestNote, setSuggestNote] = useState('')
  const [criteriaSaving, setCriteriaSaving] = useState(false)
  const [rescoring, setRescoring] = useState(false)
  const [rescoreCount, setRescoreCount] = useState(0)
  const [addApplicantsOpen, setAddApplicantsOpen] = useState(false)
  const [addingApplicant, setAddingApplicant] = useState(false)
  const [detailTab, setDetailTab] = useState<'score' | 'resume'>('score')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const addApplicantInputRef = useRef<HTMLInputElement>(null)

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
      .then((data) => {
        if (!data.job) return
        setJob({ ...data.job, extracted_themes: data.job.extracted_themes ?? [] })
        const loaded: Array<{ id: string; label: string; weight: Weight; description: string | null; criterion_type?: string; min_years?: number | null }> = data.job.criteria ?? []
        setCriteria(loaded.map((c) => ({
          key: c.id, id: c.id, label: c.label, weight: c.weight,
          description: c.description ?? undefined,
          criterionType: (c.criterion_type === 'experience' ? 'experience' : 'skill') as CriterionType,
          minYears: c.min_years ?? undefined,
        })))
      })
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
    setDetailTab('score')
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

  async function handleAddApplicantFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    setAddingApplicant(true)
    setError('')
    try {
      let lastApplicantId: string | null = null
      for (const file of files) {
        const formData = new FormData()
        formData.append('job_id', jobId)
        formData.append('file', file)
        const res = await fetch(isCsvFile(file) ? '/api/business/applicants/csv' : '/api/business/applicants/upload', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `Could not upload ${file.name}`)
        if (data.applicant?.id) lastApplicantId = data.applicant.id
      }
      await loadApplicants()
      if (lastApplicantId) setSelectedId(lastApplicantId)
      setAddApplicantsOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAddingApplicant(false)
      if (addApplicantInputRef.current) addApplicantInputRef.current.value = ''
    }
  }

  function handleExportCsv() {
    const criterionColumns = criteria.filter((c) => c.id).map((c) => ({ id: c.id as string, label: c.label }))
    const headers = ['Name', 'Email', 'Score', 'Status', 'Has Dealbreaker', 'Scored At', ...criterionColumns.map((c) => c.label)]

    const rows = applicants.map((a) => {
      const scoreByCriterion = new Map((a.applicant_criterion_scores ?? []).map((cs) => [cs.criterion_id, cs.score]))
      return [
        a.name ?? '',
        a.email ?? '',
        a.overall_score ?? '',
        STATUS_CONFIG[a.status]?.label ?? a.status,
        a.has_dealbreaker ? 'Yes' : 'No',
        a.scored_at ?? '',
        ...criterionColumns.map((c) => scoreByCriterion.get(c.id) ?? ''),
      ]
    })

    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const date = new Date().toISOString().slice(0, 10)
    const a = document.createElement('a')
    a.href = url
    a.download = `applicants-${slugify(job?.title ?? 'job')}-${date}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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

  async function handleJobStatusChange(status: string) {
    if (!job || jobStatusUpdating) return
    const previous = job.status
    setJob({ ...job, status })
    setJobStatusUpdating(true)
    try {
      const res = await fetch(`/api/business/job-postings/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Could not update job status')
    } catch (e) {
      setJob({ ...job, status: previous })
      setError((e as Error).message)
    } finally {
      setJobStatusUpdating(false)
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

  function updateCriterion(key: string, patch: Partial<Criterion>) {
    setCriteria((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }

  function removeCriterion(key: string) {
    setCriteria((cs) => cs.filter((c) => c.key !== key))
  }

  function addCriterion() {
    setCriteria((cs) => [...cs, { key: nextCriteriaKey(), label: '', weight: 'must_have', criterionType: 'skill' }])
  }

  function handleSuggestFromJd() {
    if (!job) return
    const existingLabels = new Set(criteria.map((c) => c.label.trim().toLowerCase()).filter(Boolean))
    const toAdd = job.extracted_themes.filter((theme) => !existingLabels.has(theme.trim().toLowerCase()))

    if (toAdd.length === 0) {
      setSuggestNote('All JD themes already in list.')
    } else {
      setCriteria((cs) => [
        ...cs,
        ...toAdd.map((theme) => ({ key: nextCriteriaKey(), label: theme, weight: 'must_have' as Weight, criterionType: 'skill' as CriterionType })),
      ])
      setSuggestNote(`Added ${toAdd.length} suggestion${toAdd.length === 1 ? '' : 's'} from JD`)
    }
    setTimeout(() => setSuggestNote(''), 3000)
  }

  async function handleSaveCriteria() {
    if (criteriaSaving || rescoring) return
    setCriteriaSaving(true)
    setError('')
    try {
      const payload = criteria
        .filter((c) => c.label.trim())
        .map((c) => ({
          label: c.label.trim(),
          weight: c.weight,
          description: c.description,
          criterion_type: c.criterionType,
          min_years: c.criterionType === 'experience' && c.minYears && c.minYears > 0 ? c.minYears : null,
        }))

      const res = await fetch(`/api/business/job-postings/${jobId}/criteria`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criteria: payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save criteria')

      const saved: Array<{ id: string; label: string; weight: Weight; description: string | null; criterion_type?: string; min_years?: number | null }> = data.criteria ?? []
      setCriteria(saved.map((c) => ({
        key: c.id, id: c.id, label: c.label, weight: c.weight,
        description: c.description ?? undefined,
        criterionType: (c.criterion_type === 'experience' ? 'experience' : 'skill') as CriterionType,
        minYears: c.min_years ?? undefined,
      })))
      setCriteriaSaving(false)

      if (applicants.length === 0) {
        setCriteriaOpen(false)
        return
      }

      setRescoreCount(applicants.length)
      setRescoring(true)
      try {
        const rescoreRes = await fetch(`/api/business/job-postings/${jobId}/rescore`, { method: 'POST' })
        const rescoreData = await rescoreRes.json()
        if (!rescoreRes.ok) throw new Error(rescoreData.error ?? 'Could not re-score applicants')
        await loadApplicants()
        if (selectedId) loadDetail(selectedId)
        setToast(`Re-scored ${rescoreData.rescored} applicant${rescoreData.rescored === 1 ? '' : 's'}${rescoreData.errors ? ` — ${rescoreData.errors} failed` : ''}`)
        setTimeout(() => setToast(''), 5000)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setRescoring(false)
        setCriteriaOpen(false)
      }
    } catch (e) {
      setError((e as Error).message)
      setCriteriaSaving(false)
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

  const criterionColumns = criteria
    .filter((c): c is Criterion & { id: string } => !!c.id)
    .map((c) => ({ id: c.id, label: c.label, weight: c.weight, criterionType: c.criterionType, minYears: c.minYears }))

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
          <div style={{ display: 'flex', gap: 4 }}>
            {(['draft', 'active', 'paused', 'closed'] as const).map((s) => {
              const cfg = STATUS_CONFIG[s as Status] ?? STATUS_CONFIG.new
              const active = job.status === s
              return (
                <button
                  key={s}
                  onClick={() => handleJobStatusChange(s)}
                  disabled={jobStatusUpdating}
                  style={{
                    fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                    border: `1px solid ${active ? cfg.color : 'var(--border2)'}`,
                    background: active ? cfg.bg : 'transparent',
                    color: active ? cfg.color : 'var(--text3)',
                    cursor: jobStatusUpdating ? 'default' : 'pointer',
                    textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                    fontFamily: 'var(--font)', transition: 'all 0.15s',
                  }}
                >
                  {s}
                </button>
              )
            })}
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={handleExportCsv} disabled={applicants.length === 0} style={{ fontSize: 12.5, padding: '6px 12px' }}>
            ↓ Export CSV
          </button>
          <button className="btn-ghost" onClick={() => setCriteriaOpen(true)} style={{ fontSize: 12.5, padding: '6px 12px' }}>
            ⚙ Criteria
          </button>
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

      {/* Criteria editor modal */}
      {criteriaOpen && (
        <div
          onClick={() => { if (!criteriaSaving && !rescoring) setCriteriaOpen(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 14,
              padding: 24, width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 4, letterSpacing: '-0.02em' }}>
              Scoring criteria
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18, lineHeight: 1.5 }}>
              Changes here re-score every applicant on this job automatically.
            </p>

            {job && job.extracted_themes.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <button
                  onClick={handleSuggestFromJd}
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: '5px 12px' }}
                >
                  ✦ Suggest from JD
                </button>
                {suggestNote && (
                  <span style={{ fontSize: 11, color: 'var(--teal)' }}>{suggestNote}</span>
                )}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {criteria.map((c) => (
                <div key={c.key} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input
                      className="form-input"
                      type="text"
                      value={c.label}
                      onChange={(e) => updateCriterion(c.key, { label: e.target.value })}
                      placeholder="Criterion label"
                      maxLength={100}
                      style={{ flex: 1, padding: '8px 12px', fontSize: 13 }}
                    />
                    <button
                      onClick={() => removeCriterion(c.key)}
                      style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 17, padding: '2px 6px', flexShrink: 0, lineHeight: 1 }}
                      aria-label="Remove criterion"
                    >
                      ×
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {CRITERIA_WEIGHT_OPTIONS.map((opt) => {
                      const active = c.weight === opt.value
                      return (
                        <button
                          key={opt.value}
                          onClick={() => updateCriterion(c.key, { weight: opt.value })}
                          style={{
                            fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                            border: `1px solid ${active ? opt.color : 'var(--border2)'}`,
                            background: active ? opt.bg : 'transparent',
                            color: active ? opt.color : 'var(--text3)',
                            cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s',
                          }}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', whiteSpace: 'nowrap' }}>Min. yrs</span>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={c.minYears ?? ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value)
                          updateCriterion(c.key, {
                            minYears: val > 0 ? val : undefined,
                            criterionType: val > 0 ? 'experience' : 'skill',
                          })
                        }}
                        placeholder="—"
                        className="form-input"
                        style={{ width: 44, padding: '3px 6px', fontSize: 12, textAlign: 'center' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={addCriterion} className="btn-ghost" style={{ marginBottom: 20 }}>
              + Add criterion
            </button>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setCriteriaOpen(false)}
                className="btn-ghost"
                disabled={criteriaSaving || rescoring}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCriteria}
                className="btn-primary"
                disabled={criteriaSaving || rescoring || criteria.every((c) => !c.label.trim())}
              >
                {criteriaSaving
                  ? 'Saving…'
                  : rescoring
                    ? `Re-scoring ${rescoreCount} applicant${rescoreCount === 1 ? '' : 's'}…`
                    : 'Save criteria'}
              </button>
            </div>
          </div>
        </div>
      )}

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

        {/* Ranked candidate table */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Toolbar: search + filters + sort */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <input
              className="form-input"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ fontSize: 12.5, padding: '7px 11px', maxWidth: 220 }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
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
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>
              {filtered.length} applicant{filtered.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {listLoading ? (
              <div style={{ padding: 16 }}>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} style={{ height: 44, background: 'var(--bg2)', borderRadius: 8, marginBottom: 8, opacity: 1 - i * 0.2 }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', fontSize: 12.5, color: 'var(--text3)' }}>
                {applicants.length === 0 ? 'No applicants yet. Upload a CSV or a resume.' : 'No matches.'}
              </div>
            ) : (
              <div>
                {/* Header row */}
                <div style={{
                  display: 'flex', alignItems: 'center',
                  position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2,
                  borderBottom: '1px solid var(--border)', fontSize: 10.5, fontWeight: 700,
                  color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  <div style={{ width: 36, flexShrink: 0, textAlign: 'center', padding: '8px 0' }}>#</div>
                  <div style={{ flex: 1, padding: '8px 6px' }}>Candidate</div>
                  {criterionColumns.map((c) => (
                    <div key={c.id} title={c.label} style={{ width: 44, flexShrink: 0, textAlign: 'center', padding: '6px 2px', overflow: 'hidden' }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.label.slice(0, 3).toUpperCase()}
                      </span>
                      <span style={{ display: 'block', fontSize: 9, color: 'var(--text3)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
                        {c.criterionType === 'experience'
                          ? (c.minYears ? `≥${c.minYears}yr` : 'exp')
                          : 'skill'}
                      </span>
                    </div>
                  ))}
                  <div style={{ width: 64, flexShrink: 0, textAlign: 'right', padding: '8px 8px' }}>Score</div>
                  <div style={{ width: 220, flexShrink: 0, padding: '8px 12px' }}>Summary</div>
                </div>

                {/* Rows */}
                {filtered.map((a, i) => {
                  const selected = a.id === selectedId
                  const statusCfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.new
                  return (
                    <div
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      style={{
                        display: 'flex', alignItems: 'center', cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        borderLeft: `3px solid ${selected ? 'var(--teal)' : 'transparent'}`,
                        background: selected ? 'var(--teal-dim)' : 'transparent',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--bg2)' }}
                      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{
                        width: 36, flexShrink: 0, textAlign: 'center', padding: '10px 0',
                        fontSize: 12, fontWeight: 600, color: a.has_dealbreaker ? 'var(--text3)' : 'var(--text2)',
                      }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, padding: '10px 6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.name || 'Unnamed'}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, color: statusCfg.color, background: statusCfg.bg, flexShrink: 0 }}>
                            {statusCfg.label}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.email || '—'}
                        </div>
                      </div>
                      {criterionColumns.map((c) => (
                        <div key={c.id} style={{ width: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 2px' }}>
                          <CriterionDot applicant={a} criterionId={c.id} weight={c.weight} />
                        </div>
                      ))}
                      <div style={{ width: 64, flexShrink: 0, textAlign: 'right', padding: '10px 8px' }}>
                        {a.overall_score != null ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {a.has_dealbreaker && <span style={{ color: '#ef4444', fontSize: 11 }}>⚠</span>}
                            <span style={{
                              fontSize: 12, fontWeight: 800,
                              color: scoreColor(a.overall_score),
                              background: scoreBg(a.overall_score),
                              padding: '2px 7px', borderRadius: 6,
                            }}>
                              {a.overall_score}
                            </span>
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text3)' }}>…</span>
                        )}
                      </div>
                      <div style={{
                        width: 220, flexShrink: 0, padding: '10px 12px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.4,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                      }}>
                        {generateSummary(a, criteria)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Ongoing upload — sticky footer */}
          <div style={{ borderTop: '1px solid var(--border)', padding: 10, flexShrink: 0 }}>
            <input
              ref={addApplicantInputRef}
              type="file"
              accept=".pdf,.docx,.csv"
              multiple
              onChange={(e) => handleAddApplicantFiles(e.target.files)}
              style={{ display: 'none' }}
            />
            {!addApplicantsOpen ? (
              <button
                onClick={() => setAddApplicantsOpen(true)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontSize: 12.5, fontWeight: 600, color: 'var(--teal)', background: 'var(--teal-dim)',
                  border: '1px solid var(--teal-glow)', borderRadius: 8, padding: '8px 10px',
                  cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                ＋ Add applicants
              </button>
            ) : (
              <div
                onClick={() => !addingApplicant && addApplicantInputRef.current?.click()}
                style={{
                  border: '1.5px dashed var(--border2)', borderRadius: 8, padding: '14px 10px',
                  textAlign: 'center', cursor: addingApplicant ? 'default' : 'pointer', position: 'relative',
                }}
              >
                {addingApplicant ? (
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    <span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>↻</span> Uploading…
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
                      Click to browse PDF, DOCX, or CSV
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setAddApplicantsOpen(false) }}
                      style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel — 340px, slides in when an applicant is selected */}
        {selectedId && (
          <div style={{ width: 340, flexShrink: 0, borderLeft: '1px solid var(--border)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 10px 0', flexShrink: 0 }}>
              <button
                onClick={() => setSelectedId(null)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}
              >
                ×
              </button>
            </div>

            {detailLoading || !detail ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Loading…</div>
              </div>
            ) : (
              <>
                {/* Candidate header */}
                <div style={{ padding: '0 16px 14px' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                    {detail.name || 'Unnamed applicant'}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>{detail.email || 'No email'}</div>
                  {detail.parsed_headline && (
                    <div style={{ fontSize: 12.5, color: 'var(--teal)', marginTop: 4, fontWeight: 600 }}>{detail.parsed_headline}</div>
                  )}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginTop: 12, flexShrink: 0 }}>
                  {(['score', 'resume'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setDetailTab(tab)}
                      style={{
                        flex: 1, padding: '9px 0', textAlign: 'center', fontSize: 12.5, fontWeight: 600,
                        cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'var(--font)',
                        transition: 'color 0.15s',
                        color: detailTab === tab ? 'var(--teal)' : 'var(--text3)',
                        borderBottom: detailTab === tab ? '2px solid var(--teal)' : '2px solid transparent',
                      }}
                    >
                      {tab === 'score' ? 'Score & Notes' : 'Resume'}
                    </button>
                  ))}
                </div>

                {detailTab === 'score' && (
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
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                        Notes
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
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

                {detailTab === 'resume' && (
                  <div style={{ padding: 16, overflowY: 'auto' }}>
                    {detail.resume_signed_url && (
                      <a
                        href={detail.resume_signed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost"
                        style={{ display: 'inline-flex', textDecoration: 'none', fontSize: 12.5, marginBottom: 14 }}
                      >
                        Download original file
                      </a>
                    )}
                    {detail.raw_text ? (
                      <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {detail.raw_text}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>No resume text available.</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
