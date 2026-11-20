'use client'

import { useEffect, useRef, useState } from 'react'
import { PROVIDERS, PROVIDER_INFO } from '@/lib/business/ats/registry'
import { useRouter } from 'next/navigation'

type Weight = 'dealbreaker' | 'must_have' | 'nice_to_have'
type CriterionType = 'skill' | 'experience'
type Criterion = { key: string; label: string; weight: Weight; description?: string; criterionType: CriterionType; minYears?: number }

const WEIGHT_OPTIONS: Array<{ value: Weight; label: string; color: string; bg: string }> = [
  { value: 'dealbreaker', label: 'Dealbreaker', color: 'var(--biz-clay-ink)', bg: 'var(--h-peach)' },
  { value: 'must_have', label: 'Must have', color: 'var(--biz-teal-ink)', bg: 'var(--h-lavender)' },
  { value: 'nice_to_have', label: 'Nice to have', color: 'var(--h-faint)', bg: 'var(--h-card2)' },
]

let keyCounter = 0
function nextKey() {
  keyCounter += 1
  return `c${keyCounter}`
}

type UploadStatus = 'pending' | 'uploading' | 'done' | 'error'
type UploadFile = { name: string; file: File; status: UploadStatus; error?: string }

function isCsv(file: File): boolean {
  return file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')
}

export default function NewJobPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [title, setTitle] = useState('')
  const [rawJd, setRawJd] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  // Jobs from a connected ATS, keyed "provider:id" so one picker covers Greenhouse and Workable.
  const [ghJobs, setGhJobs] = useState<Array<{ key: string; name: string }> | null>(null)
  const [ghJobId, setGhJobId] = useState('')
  const [ghLoading, setGhLoading] = useState(false)
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([])
  const [processing, setProcessing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/business/organizations')
      .then((r) => r.json())
      .then((data) => {
        const org = data.orgs?.[0]
        if (org) setOrgId(org.id)
        else router.replace('/business/onboarding')
      })
  }, [router])

  // When the org has connected an ATS, offer to start from one of its open jobs.
  useEffect(() => {
    if (!orgId) return
    fetch(`/api/business/integrations?org_id=${orgId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (st) => {
        if (!st?.integrations) return
        const out: Array<{ key: string; name: string }> = []
        // BambooHR's API has no job description text, so it can't seed a posting.
        for (const p of PROVIDERS.filter((x) => x !== 'bamboohr')) {
          const i = st.integrations[p]
          if (!i?.connected || i.status === 'error') continue
          const d = await fetch(`/api/business/integrations/${p}/jobs?org_id=${orgId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
          for (const j of d?.jobs ?? []) out.push({ key: `${p}:${j.id}`, name: `${j.name} (${PROVIDER_INFO[p].label})` })
        }
        if (out.length) setGhJobs(out)
      })
      .catch(() => null)
  }, [orgId])

  async function pickGreenhouseJob(key: string) {
    setGhJobId(key)
    if (!key || !orgId) return
    const [provider, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
    setGhLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/business/integrations/${provider}/job-post?org_id=${orgId}&ats_job_id=${encodeURIComponent(id)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load that job')
      setTitle(String(data.title ?? '').slice(0, 200))
      setRawJd(String(data.text ?? ''))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGhLoading(false)
    }
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !rawJd.trim() || !orgId || analyzing) return
    setAnalyzing(true)
    setError('')
    try {
      const res = await fetch('/api/business/job-postings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, title: title.trim(), raw_jd: rawJd.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not analyze job description')

      setJobId(data.job.id)
      if (ghJobId) {
        const i = ghJobId.indexOf(':')
        fetch('/api/business/integrations/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: data.job.id, provider: ghJobId.slice(0, i), external_id: ghJobId.slice(i + 1) }),
        }).catch(() => null)
      }
      const themes: string[] = data.job.extracted_themes ?? []
      setCriteria(themes.map((theme: string) => ({ key: nextKey(), label: theme, weight: 'must_have' as Weight, criterionType: 'skill' as CriterionType })))
      if (data.job.extraction_failed || themes.length === 0) {
        setError('We couldn\'t automatically extract criteria from this job description. Add them manually below.')
      }
      setStep(2)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAnalyzing(false)
    }
  }

  function updateCriterion(key: string, patch: Partial<Criterion>) {
    setCriteria((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }

  function removeCriterion(key: string) {
    setCriteria((cs) => cs.filter((c) => c.key !== key))
  }

  function addCriterion() {
    setCriteria((cs) => [...cs, { key: nextKey(), label: '', weight: 'must_have', criterionType: 'skill' }])
  }

  async function handleSaveCriteria() {
    if (!jobId || saving) return
    setSaving(true)
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
      setStep(3)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function processQueue(jobId: string, queue: UploadFile[]) {
    setProcessing(true)
    for (const item of queue) {
      setUploadFiles((list) => list.map((f) => (f.name === item.name && f.file === item.file ? { ...f, status: 'uploading' } : f)))
      try {
        const formData = new FormData()
        formData.append('job_id', jobId)
        formData.append('file', item.file)
        const res = await fetch(isCsv(item.file) ? '/api/business/applicants/csv' : '/api/business/applicants/upload', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Upload failed')
        setUploadFiles((list) => list.map((f) => (f.name === item.name && f.file === item.file ? { ...f, status: 'done' } : f)))
      } catch (e) {
        setUploadFiles((list) =>
          list.map((f) => (f.name === item.name && f.file === item.file ? { ...f, status: 'error', error: (e as Error).message } : f))
        )
      }
    }
    setProcessing(false)
  }

  function handleFilesSelected(fileList: FileList | File[]) {
    if (!jobId) return
    const files = Array.from(fileList).filter((f) => {
      const name = f.name.toLowerCase()
      return name.endsWith('.pdf') || name.endsWith('.docx') || name.endsWith('.csv')
    })
    if (files.length === 0) return
    const queued: UploadFile[] = files.map((file) => ({ name: file.name, file, status: 'pending' }))
    setUploadFiles((list) => [...list, ...queued])
    processQueue(jobId, queued)
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFilesSelected(e.target.files)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files) handleFilesSelected(e.dataTransfer.files)
  }

  const successCount = uploadFiles.filter((f) => f.status === 'done').length

  return (
    <div className="biz-inner" style={{ maxWidth: 680, margin: 0, gap: 0 }}>
      <h1 className="biz-h1" style={{ marginBottom: 16 }}>
        {step === 1 ? 'Create a job posting' : step === 2 ? 'Set your scoring criteria' : 'Upload applicants'}
      </h1>

      {/* Step pathway */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 28 }}>
        {([
          { n: 1, label: 'Job description' },
          { n: 2, label: 'Scoring criteria' },
          { n: 3, label: 'Upload applicants' },
        ] as Array<{ n: 1 | 2 | 3; label: string }>).map((s, i) => {
          const done = step > s.n
          const active = step === s.n
          return (
            <div key={s.n} style={{ display: 'flex', alignItems: 'flex-start', flex: i < 2 ? 1 : undefined }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                  background: done || active ? 'var(--h-accent)' : 'var(--h-card2)',
                  color: done || active ? 'var(--h-accent-ink)' : 'var(--h-faint)',
                  border: `2px solid ${done || active ? 'var(--h-accent)' : 'var(--h-line-strong)'}`,
                }}>
                  {done ? '✓' : s.n}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                  color: active ? 'var(--h-accent)' : done ? 'var(--h-muted)' : 'var(--h-faint)',
                }}>
                  {s.label}
                </span>
              </div>
              {i < 2 && (
                <div style={{
                  flex: 1, height: 2, marginTop: 12, marginLeft: 6, marginRight: 6,
                  background: step > s.n ? 'var(--h-accent)' : 'var(--h-line-strong)',
                  borderRadius: 1,
                }} />
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div role="alert" style={{ background: 'var(--h-peach)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'var(--biz-clay-ink)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {step === 1 && (
        <form onSubmit={handleAnalyze}>
          {ghJobs && ghJobs.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Start from a job in your ATS (optional)</label>
              <select className="form-input" value={ghJobId} onChange={(e) => pickGreenhouseJob(e.target.value)} disabled={ghLoading}>
                <option value="">Paste a description instead</option>
                {ghJobs.map((j) => <option key={j.key} value={j.key}>{j.name}</option>)}
              </select>
              {ghLoading && <div style={{ fontSize: 12, color: 'var(--h-faint)', marginTop: 6 }}>Loading the posting…</div>}
            </div>
          )}
          <label className="form-label">Job title</label>
          <input
            className="form-input"
            type="text"
            placeholder="Head of Community"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            style={{ marginBottom: 16 }}
          />

          <label className="form-label">Job description</label>
          <textarea
            className="form-input"
            placeholder="Paste the job description..."
            value={rawJd}
            onChange={(e) => setRawJd(e.target.value)}
            rows={14}
            style={{ marginBottom: 20, resize: 'vertical', fontFamily: 'var(--font)' }}
          />

          <button type="submit" className="biz-btn" disabled={analyzing || !title.trim() || !rawJd.trim() || !orgId}>
            {analyzing ? 'Analyzing job description…' : 'Analyze →'}
          </button>
        </form>
      )}

      {step === 2 && (
        <div>
          <p style={{ fontSize: 13.5, color: 'var(--h-muted)', marginBottom: 20, lineHeight: 1.55 }}>
            We pulled these from the JD. Promote any to dealbreaker, add custom criteria, or remove ones that don&apos;t matter.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {criteria.map((c) => (
              <div key={c.key} style={{ background: 'var(--h-card)', border: '1px solid var(--h-line)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: 'var(--h-faint)', cursor: 'grab', fontSize: 13, flexShrink: 0 }}>⠿</span>
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
                    style={{ background: 'none', border: 'none', color: 'var(--h-faint)', cursor: 'pointer', fontSize: 17, padding: '2px 6px', flexShrink: 0, lineHeight: 1 }}
                    aria-label="Remove criterion"
                  >
                    ×
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 22 }}>
                  {WEIGHT_OPTIONS.map((opt) => {
                    const active = c.weight === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => updateCriterion(c.key, { weight: opt.value })}
                        style={{
                          fontSize: 11.5, fontWeight: 600,
                          padding: '4px 10px', borderRadius: 20,
                          border: `1px solid ${active ? opt.color : 'var(--h-line-strong)'}`,
                          background: active ? opt.bg : 'transparent',
                          color: active ? opt.color : 'var(--h-faint)',
                          cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--h-faint)', whiteSpace: 'nowrap' }}>Min. yrs</span>
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
                      className="form-input"
                      style={{ width: 44, padding: '3px 6px', fontSize: 12, textAlign: 'center' }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button onClick={addCriterion} className="biz-btn biz-btn-ghost" style={{ marginBottom: 24 }}>
            + Add criterion
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(1)} className="biz-btn biz-btn-ghost">← Back</button>
            <button onClick={handleSaveCriteria} className="biz-btn" disabled={saving || criteria.every((c) => !c.label.trim())}>
              {saving ? 'Saving…' : 'Save criteria →'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && jobId && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--h-ink)', marginBottom: 6 }}>
            Upload your first applicants
          </h2>
          <p style={{ fontSize: 13.5, color: 'var(--h-muted)', marginBottom: 20, lineHeight: 1.55 }}>
            Drop in resumes to score them against your criteria. You can always add more from the job page.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.csv"
            multiple
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            style={{
              border: `1.5px dashed ${dragging ? 'var(--h-accent)' : 'var(--h-line-strong)'}`,
              background: dragging ? 'var(--h-lavender)' : 'var(--h-card)',
              borderRadius: 12,
              padding: '36px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: 20,
              transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--h-muted)' }}>
              Drop resumes or a CSV here, or click to browse
            </div>
          </div>

          {uploadFiles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
              {uploadFiles.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'var(--h-card)', border: '1px solid var(--h-line)',
                    borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--h-muted)',
                  }}
                >
                  <span style={{ flexShrink: 0 }}>
                    {f.status === 'pending' && <span style={{ color: 'var(--h-faint)' }}>…</span>}
                    {f.status === 'uploading' && <span style={{ color: 'var(--h-accent)' }}>↻</span>}
                    {f.status === 'done' && <span style={{ color: 'var(--h-accent)' }}>✓</span>}
                    {f.status === 'error' && <span style={{ color: 'var(--biz-clay-ink)' }}>✗</span>}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ fontSize: 11.5, color: f.status === 'error' ? 'var(--biz-clay-ink)' : 'var(--h-faint)', flexShrink: 0 }}>
                    {f.status === 'pending' && 'Pending'}
                    {f.status === 'uploading' && 'Scoring…'}
                    {f.status === 'done' && 'Scored'}
                    {f.status === 'error' && (f.error || 'Failed')}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => setStep(2)} className="biz-btn biz-btn-ghost">← Back</button>
            <button
              onClick={() => router.push(`/business/jobs/${jobId}`)}
              style={{ background: 'none', border: 'none', color: 'var(--h-faint)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              Skip for now →
            </button>
            {successCount > 0 && (
              <button onClick={() => router.push(`/business/jobs/${jobId}`)} className="biz-btn" disabled={processing}>
                Done →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
