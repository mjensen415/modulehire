'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Weight = 'dealbreaker' | 'must_have' | 'nice_to_have'
type Criterion = { key: string; label: string; weight: Weight; description?: string }

const WEIGHT_OPTIONS: Array<{ value: Weight; label: string; color: string; bg: string }> = [
  { value: 'dealbreaker', label: '⚠ Dealbreaker', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  { value: 'must_have', label: 'Must have', color: 'var(--teal)', bg: 'var(--teal-dim)' },
  { value: 'nice_to_have', label: 'Nice to have', color: 'var(--text3)', bg: 'var(--bg3)' },
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
      const themes: string[] = data.job.extracted_themes ?? []
      setCriteria(themes.map((theme: string) => ({ key: nextKey(), label: theme, weight: 'must_have' as Weight })))
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
    setCriteria((cs) => [...cs, { key: nextKey(), label: '', weight: 'must_have' }])
  }

  async function handleSaveCriteria() {
    if (!jobId || saving) return
    setSaving(true)
    setError('')
    try {
      const payload = criteria
        .filter((c) => c.label.trim())
        .map((c) => ({ label: c.label.trim(), weight: c.weight, description: c.description }))

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
    <div style={{ maxWidth: 680 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 4, letterSpacing: '-0.02em' }}>
        {step === 1 ? 'Create a job posting' : step === 2 ? 'Set your scoring criteria' : 'Upload applicants'}
      </h1>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 24, fontSize: 12, fontWeight: 600 }}>
        <span style={{ color: step === 1 ? 'var(--teal)' : 'var(--text3)' }}>1 Job description</span>
        <span style={{ color: 'var(--text3)' }}>—</span>
        <span style={{ color: step === 2 ? 'var(--teal)' : 'var(--text3)' }}>2 Scoring criteria</span>
        <span style={{ color: 'var(--text3)' }}>—</span>
        <span style={{ color: step === 3 ? 'var(--teal)' : 'var(--text3)' }}>3 Upload applicants</span>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#ef4444', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {step === 1 && (
        <form onSubmit={handleAnalyze}>
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

          <button type="submit" className="btn-primary" disabled={analyzing || !title.trim() || !rawJd.trim() || !orgId}>
            {analyzing ? 'Analyzing job description…' : 'Analyze →'}
          </button>
        </form>
      )}

      {step === 2 && (
        <div>
          <p style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.55 }}>
            We pulled these from the JD. Promote any to dealbreaker, add custom criteria, or remove ones that don&apos;t matter.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {criteria.map((c) => (
              <div key={c.key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: 'var(--text3)', cursor: 'grab', fontSize: 13, flexShrink: 0 }}>⠿</span>
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
                <div style={{ display: 'flex', gap: 6, paddingLeft: 22 }}>
                  {WEIGHT_OPTIONS.map((opt) => {
                    const active = c.weight === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => updateCriterion(c.key, { weight: opt.value })}
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 20,
                          border: `1px solid ${active ? opt.color : 'var(--border2)'}`,
                          background: active ? opt.bg : 'transparent',
                          color: active ? opt.color : 'var(--text3)',
                          cursor: 'pointer',
                          fontFamily: 'var(--font)',
                          transition: 'all 0.15s',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <button onClick={addCriterion} className="btn-ghost" style={{ marginBottom: 24 }}>
            + Add criterion
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(1)} className="btn-ghost">← Back</button>
            <button onClick={handleSaveCriteria} className="btn-primary" disabled={saving || criteria.every((c) => !c.label.trim())}>
              {saving ? 'Saving…' : 'Save criteria →'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && jobId && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Upload your first applicants
          </h2>
          <p style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.55 }}>
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
              border: `1.5px dashed ${dragging ? 'var(--teal)' : 'var(--border2)'}`,
              background: dragging ? 'var(--teal-dim)' : 'var(--surface)',
              borderRadius: 12,
              padding: '36px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: 20,
              transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text2)' }}>
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
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text2)',
                  }}
                >
                  <span style={{ flexShrink: 0 }}>
                    {f.status === 'pending' && <span style={{ color: 'var(--text3)' }}>…</span>}
                    {f.status === 'uploading' && <span style={{ color: 'var(--teal)' }}>↻</span>}
                    {f.status === 'done' && <span style={{ color: 'var(--teal)' }}>✓</span>}
                    {f.status === 'error' && <span style={{ color: '#ef4444' }}>✗</span>}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ fontSize: 11.5, color: f.status === 'error' ? '#ef4444' : 'var(--text3)', flexShrink: 0 }}>
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
            <button onClick={() => setStep(2)} className="btn-ghost">← Back</button>
            <button
              onClick={() => router.push(`/business/jobs/${jobId}`)}
              style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              Skip for now →
            </button>
            {successCount > 0 && (
              <button onClick={() => router.push(`/business/jobs/${jobId}`)} className="btn-primary" disabled={processing}>
                Done →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
