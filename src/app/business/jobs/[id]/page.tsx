'use client'

// Posting workspace: ranked applicant list beside the selected candidate.
// Styles: ./posting.css (.bp-*) on top of business.css (.biz-*).

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import AtsImport from './AtsImport'
import { isProvider, PROVIDER_INFO, providerLabel } from '@/lib/business/ats/registry'
import './posting.css'

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

type AiCheckResult = {
  likely_ai: boolean
  confidence: string
  signals: string[]
  human_signals: string[]
  summary: string
}

type ApplicantDetail = Applicant & {
  raw_text: string | null
  criteria_scores: CriterionScore[]
  notes: Note[]
  resume_signed_url: string | null
  ai_check_result: AiCheckResult | null
  ai_checked_at: string | null
  source?: string | null
  external_source?: string | null
  ats_stage?: string | null
  ats_note_posted_at?: string | null
}

type Job = {
  id: string
  title: string
  status: string
  extracted_themes: string[]
  extracted_company?: string | null
  external_source?: string | null
}

type Status = 'new' | 'reviewing' | 'shortlisted' | 'interviewing' | 'offered' | 'rejected'
type SortKey = 'score' | 'name' | 'date'

type Weight = 'dealbreaker' | 'must_have' | 'nice_to_have'
type CriterionType = 'skill' | 'experience'
type Criterion = { key: string; id?: string; label: string; weight: Weight; description?: string; criterionType: CriterionType; minYears?: number }

const WEIGHT_LABEL: Record<Weight, string> = {
  dealbreaker: 'Dealbreaker',
  must_have: 'Must have',
  nice_to_have: 'Nice to have',
}
const WEIGHTS: Weight[] = ['dealbreaker', 'must_have', 'nice_to_have']

const AI_REVIEW_THRESHOLD = 88

let criteriaKeyCounter = 0
function nextCriteriaKey() {
  criteriaKeyCounter += 1
  return `nc${criteriaKeyCounter}`
}

const STATUSES: Status[] = ['new', 'reviewing', 'shortlisted', 'interviewing', 'offered', 'rejected']

// label + biz-chip variant
const STATUS_CONFIG: Record<Status, { label: string; chip: string }> = {
  new:          { label: 'New',          chip: '' },
  reviewing:    { label: 'Reviewing',    chip: 'sand' },
  shortlisted:  { label: 'Shortlisted',  chip: 'teal' },
  interviewing: { label: 'Interviewing', chip: 'solid' },
  offered:      { label: 'Offered',      chip: 'sage' },
  rejected:     { label: 'Rejected',     chip: 'clay' },
}

const NEXT_STAGE: Partial<Record<Status, Status>> = {
  new: 'reviewing',
  reviewing: 'shortlisted',
  shortlisted: 'interviewing',
  interviewing: 'offered',
}

const JOB_STATUSES: Array<{ value: string; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'closed', label: 'Closed (archived)' },
]

const SOURCE_LABELS: Record<string, string> = {
  upload: 'direct upload',
  bulk: 'direct upload',
  csv: 'CSV import',
  import: 'file import',
  link: 'link',
  email: 'email',
}

function scoreClass(score: number | null, dealbreaker: boolean) {
  if (score == null) return 'none'
  if (dealbreaker) return 'lo'
  if (score >= 80) return 'hi'
  if (score >= 60) return 'mid'
  return 'lo'
}

function isMet(cs: { score: number | null; met: boolean | null }) {
  return cs.met === true || (cs.met == null && cs.score != null && cs.score >= 65)
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

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function sourceText(d: ApplicantDetail): string | null {
  const ext = providerLabel(d.external_source) ?? providerLabel(d.source)
  if (ext) return `from ${ext}`
  if (d.source && SOURCE_LABELS[d.source]) return `via ${SOURCE_LABELS[d.source]}`
  return null
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

/** "Meets X of Y" for a list row, or null when the applicant has no criterion scores yet. */
function meetsLine(a: Applicant): string | null {
  const scores = (a.applicant_criterion_scores ?? []).filter((s) => s.score != null || s.met != null)
  if (scores.length === 0) return null
  return `Meets ${scores.filter(isMet).length} of ${scores.length}`
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M9 2l6 2.5v4c0 4-2.6 6.5-6 7.5-3.4-1-6-3.5-6-7.5v-4z" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M4 9.5l3 3 7-7" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
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
  const [hideDealbreakers, setHideDealbreakers] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [search, setSearch] = useState('')
  const [jobStatusUpdating, setJobStatusUpdating] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [criteriaOpen, setCriteriaOpen] = useState(false)
  const [suggestNote, setSuggestNote] = useState('')
  const [criteriaSaving, setCriteriaSaving] = useState(false)
  const [rescoring, setRescoring] = useState(false)
  const [rescoreCount, setRescoreCount] = useState(0)
  const [atsImportOpen, setAtsImportOpen] = useState(false)
  const [addingApplicant, setAddingApplicant] = useState(false)
  const [detailTab, setDetailTab] = useState<'score' | 'resume'>('score')
  const [aiChecking, setAiChecking] = useState(false)
  const [aiCheckResult, setAiCheckResult] = useState<AiCheckResult | null>(null)
  const [aiCheckedNow, setAiCheckedNow] = useState(false)

  const addApplicantInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const latestDetailRequest = useRef<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 5000)
  }, [])

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches the job's applicants on mount and when the job changes
    loadApplicants()
  }, [jobId, loadApplicants])

  const loadDetail = useCallback(async (id: string) => {
    latestDetailRequest.current = id
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/business/applicants/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load applicant')
      if (latestDetailRequest.current !== id) return
      setDetail(data.applicant)
      setAiCheckResult(data.applicant.ai_check_result ?? null)
      setAiCheckedNow(false)
    } catch (e) {
      if (latestDetailRequest.current === id) setError((e as Error).message)
    } finally {
      if (latestDetailRequest.current === id) setDetailLoading(false)
    }
  }, [])

  // Stage counts ignore the search box and the dealbreaker toggle.
  const stageCounts = STATUSES.reduce((acc, s) => {
    acc[s] = applicants.filter((a) => a.status === s).length
    return acc
  }, {} as Record<Status, number>)

  const inStage = applicants.filter((a) => statusFilter === 'all' || a.status === statusFilter)
  const dealbreakerCount = inStage.filter((a) => a.has_dealbreaker).length

  const filtered = inStage
    .filter((a) => !hideDealbreakers || !a.has_dealbreaker)
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

  // The panel shows the chosen applicant, or the top of the current list.
  const activeId = selectedId && filtered.some((a) => a.id === selectedId) ? selectedId : (filtered[0]?.id ?? null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the detail pane when a different applicant is shown
    setDetailTab('score')
    setAiCheckResult(null)
    if (activeId) loadDetail(activeId)
    else {
      latestDetailRequest.current = null
      setDetail(null)
    }
  }, [activeId, loadDetail])

  function selectApplicant(id: string) {
    setSelectedId(id)
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }

  async function runAiCheck(applicantId: string) {
    setAiChecking(true)
    try {
      const res = await fetch(`/api/business/applicants/${applicantId}/ai-check`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not run AI check')
      setAiCheckResult(data.result)
      setAiCheckedNow(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAiChecking(false)
    }
  }

  // Resumes (PDF/DOCX) go one by one to the upload route; a CSV goes to the batch route.
  async function handleAddApplicantFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    setAddingApplicant(true)
    setError('')
    try {
      let lastApplicantId: string | null = null
      let csvProcessed = 0
      let csvFailed = 0
      let sawCsv = false
      for (const file of files) {
        const formData = new FormData()
        formData.append('job_id', jobId)
        formData.append('file', file)
        const csv = isCsvFile(file)
        const res = await fetch(csv ? '/api/business/applicants/csv' : '/api/business/applicants/upload', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `Could not upload ${file.name}`)
        if (csv) {
          sawCsv = true
          csvProcessed += data.processed ?? 0
          csvFailed += data.failed ?? 0
        }
        if (data.applicant?.id) lastApplicantId = data.applicant.id
      }
      await loadApplicants()
      if (lastApplicantId) setSelectedId(lastApplicantId)
      if (sawCsv) {
        showToast(`Processed ${csvProcessed} applicant${csvProcessed === 1 ? '' : 's'}${csvFailed ? `, ${csvFailed} failed` : ''}`)
      }
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
    if (!detail || detail.status === status) return
    const previous = detail.status
    const id = detail.id
    setDetail({ ...detail, status })
    setApplicants((as) => as.map((a) => (a.id === id ? { ...a, status } : a)))
    try {
      const res = await fetch(`/api/business/applicants/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Could not update status')
    } catch (e) {
      setDetail((d) => (d && d.id === id ? { ...d, status: previous } : d))
      setApplicants((as) => as.map((a) => (a.id === id ? { ...a, status: previous } : a)))
      setError((e as Error).message)
    }
  }

  async function handleJobStatusChange(status: string) {
    if (!job || jobStatusUpdating || job.status === status) return
    const previous = job.status
    setJob({ ...job, status })
    setJobStatusUpdating(true)
    try {
      const res = await fetch(`/api/business/job-postings/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Could not update job status')
      }
      if (status === 'closed') showToast('Posting archived')
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

  const closeCriteria = useCallback(() => {
    if (!criteriaSaving && !rescoring) setCriteriaOpen(false)
  }, [criteriaSaving, rescoring])

  useEffect(() => {
    if (!criteriaOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeCriteria() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [criteriaOpen, closeCriteria])

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
        if (activeId) loadDetail(activeId)
        showToast(`Re-scored ${rescoreData.rescored} applicant${rescoreData.rescored === 1 ? '' : 's'}${rescoreData.errors ? `, ${rescoreData.errors} failed` : ''}`)
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

  const shown = detail && detail.id === activeId && !detailLoading ? detail : null
  const extSource = job?.external_source ? providerLabel(job.external_source) : null
  const writeBackProvider = shown?.external_source && isProvider(shown.external_source) ? shown.external_source : null
  const aiEligible = !!shown && shown.overall_score != null && shown.overall_score >= AI_REVIEW_THRESHOLD && !shown.has_dealbreaker
  const nextStage = shown ? NEXT_STAGE[shown.status] : undefined

  return (
    <div className="biz-inner bp">
      <header className="biz-head">
        <div className="bp-head-main">
          <Link href="/business/jobs" className="bp-back">← Postings</Link>
          <h1 className="biz-h1">{job?.title ?? 'Loading posting'}</h1>
          <div className="bp-meta">
            {job?.extracted_company && <><span>{job.extracted_company}</span><span className="bp-meta-sep" aria-hidden="true">·</span></>}
            <span>{listLoading ? 'Loading applicants' : `${applicants.length} applicant${applicants.length === 1 ? '' : 's'}`}</span>
            {extSource && <><span className="bp-meta-sep" aria-hidden="true">·</span><span>linked to {extSource}</span></>}
            {job && (
              <>
                <span className="bp-meta-sep" aria-hidden="true">·</span>
                <label className="bp-status">
                  Posting
                  <select
                    className="bp-select"
                    value={job.status}
                    onChange={(e) => handleJobStatusChange(e.target.value)}
                    disabled={jobStatusUpdating}
                  >
                    {JOB_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </label>
              </>
            )}
          </div>
        </div>
        <div className="biz-actions">
          <input
            ref={addApplicantInputRef}
            type="file"
            accept=".pdf,.docx,.csv"
            multiple
            onChange={(e) => handleAddApplicantFiles(e.target.files)}
            className="bp-sr"
            tabIndex={-1}
            aria-hidden="true"
          />
          <button
            type="button"
            className="biz-btn biz-btn-ghost"
            onClick={() => addApplicantInputRef.current?.click()}
            disabled={addingApplicant}
            title="PDF or DOCX resumes, or a CSV batch"
          >
            {addingApplicant ? 'Uploading…' : 'Add applicants'}
          </button>
          <button type="button" className="biz-btn biz-btn-ghost" onClick={() => setAtsImportOpen(true)} disabled={!job}>
            {applicants.length === 0 ? 'Import from your ATS' : 'Import more'}
          </button>
          <button type="button" className="biz-btn biz-btn-ghost" onClick={() => setCriteriaOpen(true)}>
            Edit criteria
          </button>
        </div>
      </header>

      {toast && (
        <div className="bp-toast" role="status">
          {toast}
        </div>
      )}
      {error && (
        <div className="bp-error" role="alert">
          <span>{error}</span>
          <button type="button" className="bp-x" onClick={() => setError('')} aria-label="Dismiss error">×</button>
        </div>
      )}

      <div className="bp-filters" role="group" aria-label="Filter by stage">
        <button type="button" className="bp-pill" aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
          All <span className="bp-pill-n">{applicants.length}</span>
        </button>
        {STATUSES.map((s) => (
          <button key={s} type="button" className="bp-pill" aria-pressed={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {STATUS_CONFIG[s].label} <span className="bp-pill-n">{stageCounts[s]}</span>
          </button>
        ))}
        <span className="bp-filters-gap" />
        <label className="bp-check">
          <input type="checkbox" checked={hideDealbreakers} onChange={(e) => setHideDealbreakers(e.target.checked)} />
          Hide missed dealbreakers ({dealbreakerCount})
        </label>
      </div>

      <div className="bp-cols">
        <section aria-label="Ranked applicants" className="biz-card bp-list">
          <div className="bp-list-tools">
            <label className="bp-sr" htmlFor="bp-search">Search applicants</label>
            <input
              id="bp-search"
              type="search"
              className="bp-search"
              placeholder="Search name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="bp-sr" htmlFor="bp-sort">Sort by</label>
            <select id="bp-sort" className="bp-select" style={{ minHeight: 40 }} value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="score">Score</option>
              <option value="name">Name</option>
              <option value="date">Newest</option>
            </select>
          </div>

          {listLoading ? (
            <div aria-busy="true" aria-label="Loading applicants">
              {[0, 1, 2, 3].map((i) => <div key={i} className="bp-skel" style={{ opacity: 1 - i * 0.2 }} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bp-list-empty">
              {applicants.length === 0
                ? 'No applicants yet. Add resumes or a CSV, or import from your ATS.'
                : inStage.length > 0 && dealbreakerCount === inStage.length && hideDealbreakers
                  ? 'Everyone here missed a dealbreaker. Untick "Hide missed dealbreakers" to see them.'
                  : 'No applicants match.'}
            </div>
          ) : (
            <ul className="bp-rows">
              {filtered.map((a) => {
                const selected = a.id === activeId
                const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.new
                const meets = meetsLine(a)
                const sub = a.has_dealbreaker
                  ? ['Missed a dealbreaker', a.parsed_headline].filter(Boolean).join(' · ')
                  : [meets ?? (a.overall_score == null ? 'Scoring…' : null), a.parsed_headline ?? a.email].filter(Boolean).join(' · ')
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="bp-row"
                      aria-current={selected ? 'true' : undefined}
                      onClick={() => selectApplicant(a.id)}
                    >
                      <span
                        className={`biz-score ${selected && a.overall_score != null && !a.has_dealbreaker ? 'top' : scoreClass(a.overall_score, a.has_dealbreaker)}`}
                        aria-label={a.overall_score != null ? `Score ${a.overall_score}` : 'Not scored yet'}
                      >
                        {a.overall_score ?? '–'}
                      </span>
                      <span className="bp-row-body">
                        <span className="bp-row-name">
                          <span>{a.name || 'Unnamed'}</span>
                          {a.overall_score != null && a.overall_score >= AI_REVIEW_THRESHOLD && !a.has_dealbreaker && (
                            <span className="biz-chip sand bp-flag" title="High match: worth verifying">Verify</span>
                          )}
                        </span>
                        <span className={`bp-row-sub${a.has_dealbreaker ? ' miss' : ''}`}>{sub || '–'}</span>
                      </span>
                      <span className={`biz-chip ${cfg.chip}`}>{cfg.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {!listLoading && applicants.length > 0 && (
            <div className="bp-list-foot">
              <span>Showing {filtered.length} of {applicants.length}</span>
              <button type="button" className="bp-linkbtn" onClick={handleExportCsv}>Export CSV</button>
            </div>
          )}
        </section>

        <section ref={panelRef} aria-labelledby="bp-cand-h" aria-busy={!!activeId && !shown} className="biz-card bp-panel">
          {!activeId ? (
            <div className="bp-panel-empty">
              <h2 id="bp-cand-h" className="biz-h2">No applicant selected</h2>
              <p>{applicants.length === 0 ? 'Applicants you add or import show up here, scored against your criteria.' : 'Pick someone from the list.'}</p>
            </div>
          ) : !shown ? (
            <div className="bp-panel-empty">
              <h2 id="bp-cand-h" className="bp-sr">Applicant</h2>
              Loading…
            </div>
          ) : (
            <>
              <div className="bp-cand-head">
                <div
                  className={`bp-ring${shown.overall_score == null ? ' none' : shown.has_dealbreaker ? ' miss' : ''}`}
                  style={{ '--pct': Math.max(0, Math.min(100, shown.overall_score ?? 0)) } as React.CSSProperties}
                  role="img"
                  aria-label={shown.overall_score != null ? `Score ${shown.overall_score} out of 100` : 'Scoring in progress'}
                >
                  <span aria-hidden="true">{shown.overall_score ?? '–'}</span>
                </div>
                <div className="bp-cand-id">
                  <h2 id="bp-cand-h" className="bp-cand-name">{shown.name || 'Unnamed applicant'}</h2>
                  <span className="bp-cand-meta">
                    {[shown.email || 'No email', sourceText(shown)].filter(Boolean).join(' · ')}
                    {shown.resume_signed_url && (
                      <>
                        {' · '}
                        <a href={shown.resume_signed_url} target="_blank" rel="noopener noreferrer">Original file</a>
                      </>
                    )}
                  </span>
                  {shown.parsed_headline && <span className="bp-cand-headline">{shown.parsed_headline}</span>}
                  {shown.ats_stage && writeBackProvider && (
                    <span className="bp-cand-meta">Stage in {PROVIDER_INFO[writeBackProvider].label}: {shown.ats_stage}</span>
                  )}
                </div>
                <div className="bp-cand-actions">
                  {shown.status !== 'rejected' ? (
                    <button type="button" className="biz-btn biz-btn-ghost" onClick={() => handleStatusChange('rejected')}>Reject</button>
                  ) : (
                    <button type="button" className="biz-btn biz-btn-ghost" onClick={() => handleStatusChange('new')}>Move back to New</button>
                  )}
                  {nextStage && (
                    <button type="button" className="biz-btn" onClick={() => handleStatusChange(nextStage)}>
                      Move to {STATUS_CONFIG[nextStage].label}
                    </button>
                  )}
                  <label className="bp-stage">
                    <span className="bp-sr">Stage</span>
                    <select className="bp-select" value={shown.status} onChange={(e) => handleStatusChange(e.target.value as Status)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              <div className="biz-tabs" role="tablist" aria-label="Applicant details">
                <button type="button" role="tab" id="bp-tab-score" aria-controls="bp-tabpanel" aria-selected={detailTab === 'score'} onClick={() => setDetailTab('score')}>
                  Score and notes
                </button>
                <button type="button" role="tab" id="bp-tab-resume" aria-controls="bp-tabpanel" aria-selected={detailTab === 'resume'} onClick={() => setDetailTab('resume')}>
                  Resume
                </button>
              </div>

              <div id="bp-tabpanel" role="tabpanel" aria-labelledby={detailTab === 'score' ? 'bp-tab-score' : 'bp-tab-resume'} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {detailTab === 'score' ? (
                  <>
                    {shown.overall_score == null ? (
                      <p className="bp-summary">Scoring in progress…</p>
                    ) : (
                      <p className="bp-summary">{generateSummary(shown, criteria)}</p>
                    )}
                    {shown.has_dealbreaker && <p className="bp-alert">Missed a dealbreaker</p>}

                    {shown.criteria_scores.length > 0 && (
                      <div className="bp-crit">
                        <h3 className="bp-h3">Criteria</h3>
                        {shown.criteria_scores.map((cs) => {
                          const weight = (cs.weight && cs.weight in WEIGHT_LABEL ? cs.weight : 'nice_to_have') as Weight
                          const met = isMet(cs)
                          const noEvidence = !cs.evidence || /not found/i.test(cs.evidence)
                          let result = '–'
                          let resultLabel = 'Not scored yet'
                          let resultClass = ''
                          if (weight === 'dealbreaker' && (cs.met != null || cs.score != null)) {
                            result = met ? 'Met' : 'Missed'
                            resultLabel = met ? 'Met' : 'Not met'
                            resultClass = met ? 'met' : 'miss'
                          } else if (cs.score != null) {
                            const outOf5 = Math.max(0, Math.min(5, Math.round(cs.score / 20)))
                            result = `${outOf5}/5`
                            resultLabel = `${met ? 'Met' : 'Not met'}, scored ${cs.score} out of 100`
                            resultClass = met ? 'met' : ''
                          }
                          return (
                            <div key={cs.criterion_id} className="bp-crit-row">
                              <span className={`bp-weight ${weight}`}>{WEIGHT_LABEL[weight]}</span>
                              <div className="bp-crit-text">
                                <span className="bp-crit-label">{cs.label ?? 'Criterion'}</span>
                                {noEvidence
                                  ? <span className="bp-evidence none">Not found in the resume</span>
                                  : <span className="bp-evidence">&ldquo;{cs.evidence}&rdquo;</span>}
                              </div>
                              <span className={`bp-result ${resultClass}`} title={resultLabel}>
                                <span aria-hidden="true">{result}</span>
                                <span className="bp-sr">{resultLabel}</span>
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {(aiCheckResult || aiEligible || shown.ats_note_posted_at) && (
                      <div className="bp-cards">
                        {aiCheckResult ? (
                          <div className={`bp-info${aiCheckResult.likely_ai ? ' warn' : ''}`}>
                            <ShieldIcon />
                            <div className="bp-info-body">
                              <span className="bp-info-title">
                                AI writing check: {aiCheckResult.likely_ai ? 'likely AI-generated' : 'looks human'}
                              </span>
                              <span className="bp-info-note">
                                {aiCheckResult.confidence} confidence
                                {aiCheckedNow ? ' · checked just now' : shown.ai_checked_at ? ` · checked ${shortDate(shown.ai_checked_at)}` : ''}
                              </span>
                              <details>
                                <summary>Details</summary>
                                <p style={{ margin: '4px 0 6px' }}>{aiCheckResult.summary}</p>
                                {aiCheckResult.signals.length > 0 && (
                                  <>
                                    <div className="bp-info-k">Signals</div>
                                    <ul>{aiCheckResult.signals.map((s, i) => <li key={i}>{s}</li>)}</ul>
                                  </>
                                )}
                                {aiCheckResult.human_signals.length > 0 && (
                                  <>
                                    <div className="bp-info-k">Human signals</div>
                                    <ul>{aiCheckResult.human_signals.map((s, i) => <li key={i}>{s}</li>)}</ul>
                                  </>
                                )}
                                {aiCheckResult.likely_ai && (
                                  <p style={{ margin: '4px 0 6px', fontStyle: 'italic' }}>
                                    If this candidate used ModuleHire, their resume was built from real experience
                                    modules, but may read as AI-optimized. Consider asking them to explain a specific
                                    bullet point to verify.
                                  </p>
                                )}
                              </details>
                              <button type="button" className="bp-linkbtn" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => runAiCheck(shown.id)} disabled={aiChecking}>
                                {aiChecking ? 'Re-running…' : 'Re-run check'}
                              </button>
                            </div>
                          </div>
                        ) : aiEligible ? (
                          <div className="bp-info warn">
                            <ShieldIcon />
                            <div className="bp-info-body">
                              <span className="bp-info-title">High match: verify authenticity</span>
                              <span className="bp-info-note">
                                This resume scores {shown.overall_score}/100 with no dealbreakers. High-scoring resumes are
                                sometimes AI-optimized, so review the original and verify key experience directly.
                              </span>
                              <button type="button" className="biz-btn biz-btn-ghost biz-btn-sm" onClick={() => runAiCheck(shown.id)} disabled={aiChecking}>
                                {aiChecking ? 'Analyzing…' : 'Run AI writing check'}
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {shown.ats_note_posted_at && (
                          <div className="bp-info">
                            <CheckIcon />
                            <div className="bp-info-body">
                              <span className="bp-info-title">
                                Score posted to {writeBackProvider ? PROVIDER_INFO[writeBackProvider].label : 'your ATS'}
                              </span>
                              <span className="bp-info-note">
                                As a {writeBackProvider ? PROVIDER_INFO[writeBackProvider].noteWord : 'note'} on the application · {shortDate(shown.ats_note_posted_at)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="bp-notes">
                      <h3 className="bp-h3">Team notes</h3>
                      {shown.notes.length === 0 ? (
                        <span className="biz-faint" style={{ fontSize: 13 }}>No notes yet.</span>
                      ) : shown.notes.map((note) => (
                        <div key={note.id} className="bp-note">
                          <span className="bp-note-time">{timeAgo(note.created_at)}</span>
                          {note.body}
                        </div>
                      ))}
                      <label className="bp-field">
                        <span className="bp-sr">Add a team note</span>
                        <textarea
                          className="bp-textarea"
                          placeholder="Add a note"
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          rows={3}
                          maxLength={2000}
                        />
                      </label>
                      <div className="bp-note-actions">
                        <button type="button" className="biz-btn biz-btn-ghost biz-btn-sm" onClick={handleAddNote} disabled={savingNote || !noteText.trim()}>
                          {savingNote ? 'Saving…' : 'Add note'}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {shown.resume_signed_url && (
                      <a href={shown.resume_signed_url} target="_blank" rel="noopener noreferrer" className="biz-btn biz-btn-ghost biz-btn-sm" style={{ alignSelf: 'flex-start' }}>
                        Download original file
                      </a>
                    )}
                    {shown.raw_text
                      ? <pre className="bp-resume">{shown.raw_text}</pre>
                      : <span className="biz-muted">No resume text available.</span>}
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {criteriaOpen && (
        <div className="bp-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeCriteria() }}>
          <div className="biz-card bp-modal" role="dialog" aria-modal="true" aria-labelledby="bp-crit-h">
            <div className="bp-modal-row" style={{ justifyContent: 'space-between' }}>
              <h2 id="bp-crit-h" className="biz-h2">Scoring criteria</h2>
              <button type="button" className="bp-x" onClick={closeCriteria} disabled={criteriaSaving || rescoring} aria-label="Close">×</button>
            </div>
            <p>Changes here re-score every applicant on this posting automatically.</p>

            {job && job.extracted_themes.length > 0 && (
              <div className="bp-modal-row">
                <button type="button" className="biz-btn biz-btn-ghost biz-btn-sm" onClick={handleSuggestFromJd}>
                  Suggest from the job description
                </button>
                {suggestNote && <span className="bp-hint" role="status">{suggestNote}</span>}
              </div>
            )}

            <div className="bp-edit-list">
              {criteria.map((c, idx) => (
                <div key={c.key} className="bp-edit">
                  <div className="bp-edit-top">
                    <label className="bp-sr" htmlFor={`bp-crit-${c.key}`}>Criterion {idx + 1}</label>
                    <input
                      id={`bp-crit-${c.key}`}
                      className="bp-input"
                      type="text"
                      value={c.label}
                      onChange={(e) => updateCriterion(c.key, { label: e.target.value })}
                      placeholder="Criterion label"
                      maxLength={100}
                    />
                    <button type="button" className="bp-x" onClick={() => removeCriterion(c.key)} aria-label={`Remove ${c.label || 'criterion'}`}>
                      ×
                    </button>
                  </div>
                  <div className="bp-edit-bottom" role="group" aria-label="Weight">
                    {WEIGHTS.map((w) => (
                      <button
                        key={w}
                        type="button"
                        className={`bp-wopt ${w}`}
                        aria-pressed={c.weight === w}
                        onClick={() => updateCriterion(c.key, { weight: w })}
                      >
                        {WEIGHT_LABEL[w]}
                      </button>
                    ))}
                    <label className="bp-years">
                      Min. years
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
                        placeholder="–"
                        className="bp-input"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="bp-modal-row">
              <button type="button" className="biz-btn biz-btn-ghost biz-btn-sm" onClick={addCriterion}>+ Add criterion</button>
            </div>

            <div className="bp-modal-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="biz-btn biz-btn-ghost" onClick={closeCriteria} disabled={criteriaSaving || rescoring}>
                Cancel
              </button>
              <button
                type="button"
                className="biz-btn"
                onClick={handleSaveCriteria}
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

      {atsImportOpen && job && (
        <AtsImport
          jobId={jobId}
          jobTitle={job.title}
          onClose={() => setAtsImportOpen(false)}
          onImported={() => { loadApplicants() }}
        />
      )}
    </div>
  )
}
