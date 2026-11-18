'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import type { ImportKind } from '@/lib/documents'

type Job = { id: string; company: string; title: string | null; start_date: string | null; end_date: string | null }
type Phase =
  | { step: 'pick' }
  | { step: 'uploading' }
  | { step: 'job'; documentId: string; filename: string; jobs: Job[]; jobId: string; period: string }
  | { step: 'parsing'; filename: string }
  | { step: 'done'; count: number; message?: string }

const year = (d: string | null) => (d ? String(d).slice(0, 4) : null)
const range = (j: Job) => [year(j.start_date), year(j.end_date) ?? 'now'].filter(Boolean).join(' to ')

// Import a performance review, brag doc or other document: upload → "Which role is this from?" →
// accomplishments extracted as drafts → the library's review queue.
export default function DocumentImport({ kind }: { kind: ImportKind }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>({ step: 'pick' })
  const [error, setError] = useState<{ message: string; code?: string } | null>(null)

  const noun = kind === 'performance_review' ? 'performance review' : kind === 'brag_doc' ? 'brag doc' : 'document'

  async function upload(file: File) {
    setError(null)
    setPhase({ step: 'uploading' })
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('kind', kind)
      const res = await fetch('/api/upload-document', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw Object.assign(new Error(data.error ?? 'Upload failed'), { code: data.code })
      setPhase({
        step: 'job',
        documentId: data.document.id,
        filename: data.document.filename,
        jobs: data.jobs ?? [],
        jobId: data.suggested_job_id ?? data.jobs?.[0]?.id ?? '',
        period: data.document.period_label ?? '',
      })
    } catch (e) {
      setError({ message: (e as Error).message, code: (e as Error & { code?: string }).code })
      setPhase({ step: 'pick' })
    }
  }

  async function parse() {
    if (phase.step !== 'job' || !phase.jobId) return
    const { documentId, jobId, period, filename } = phase
    setError(null)
    setPhase({ step: 'parsing', filename })
    try {
      const res = await fetch('/api/parse-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId, job_experience_id: jobId, period_label: period }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      setPhase({ step: 'done', count: data.modules?.length ?? 0, message: data.message })
    } catch (e) {
      setError({ message: (e as Error).message })
      setPhase(p => (p.step === 'parsing' ? { step: 'pick' } : p))
    }
  }

  return (
    <div className="di">
      <style>{DI_CSS}</style>
      {error && (
        <div className="di-error">
          {error.message}{' '}
          {error.code === 'DOCUMENT_LIMIT_REACHED' && <Link href="/pricing" className="btn-primary di-inline">Start a 30-day Sprint</Link>}
        </div>
      )}

      {phase.step === 'pick' && (
        <>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" hidden onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
          <button
            type="button"
            className="upload-zone di-zone"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) upload(f) }}
          >
            <div className="upload-title">Drop your {noun} here</div>
            <p className="upload-subtext">PDF, DOCX or TXT, max 10MB</p>
            <p className="di-hint">
              We pull out concrete accomplishments, each with the line it came from. Ratings, opinions and future goals are skipped.
              Nothing is used until you confirm it.
            </p>
          </button>
        </>
      )}

      {phase.step === 'uploading' && <div className="di-status">Reading your {noun}…</div>}

      {phase.step === 'job' && (
        phase.jobs.length === 0 ? (
          <div className="di-card">
            <div className="di-q">Which role is this {noun} from?</div>
            <p className="di-hint">Your work history is empty. Upload your resume first so we know your roles, then import this again.</p>
            <Link href="/upload" className="btn-primary di-inline">Upload your resume</Link>
          </div>
        ) : (
          <div className="di-card">
            <div className="di-q">Which role is this {noun} from?</div>
            <p className="di-hint">{phase.filename}{phase.period ? ` · we read it as a ${phase.period}` : ''}</p>
            <div className="di-jobs" role="radiogroup" aria-label="Role">
              {phase.jobs.map(j => (
                <label key={j.id} className={`di-job${phase.jobId === j.id ? ' on' : ''}`}>
                  <input type="radio" name="job" checked={phase.jobId === j.id} onChange={() => setPhase({ ...phase, jobId: j.id })} />
                  <span><strong>{j.title || 'Untitled role'}</strong> at {j.company}<span className="di-dates">{range(j)}</span></span>
                </label>
              ))}
            </div>
            {kind === 'performance_review' && (
              <label className="di-period">
                Review period
                <input value={phase.period} placeholder="e.g. 2025 annual review" onChange={e => setPhase({ ...phase, period: e.target.value })} />
              </label>
            )}
            <button type="button" className="btn-primary" disabled={!phase.jobId} onClick={parse}>Find accomplishments</button>
          </div>
        )
      )}

      {phase.step === 'parsing' && <div className="di-status">Finding accomplishments in {phase.filename}…</div>}

      {phase.step === 'done' && (
        <div className="di-card">
          {phase.count > 0 ? (
            <>
              <div className="di-q">{phase.count} new module{phase.count === 1 ? '' : 's'} to review</div>
              <p className="di-hint">Each one shows the line it came from. Confirm the ones that are true; only confirmed modules go on a resume.</p>
              <Link href="/library#review" className="btn-primary di-inline">Review them now</Link>
            </>
          ) : (
            <>
              <div className="di-q">Nothing to add from this one</div>
              <p className="di-hint">{phase.message}</p>
            </>
          )}
          <button type="button" className="btn-ghost" onClick={() => setPhase({ step: 'pick' })}>Import another</button>
        </div>
      )}
    </div>
  )
}

const DI_CSS = `
.di { width: 100%; display: flex; flex-direction: column; gap: 14px; }
.di-zone { width: 100%; font: inherit; color: inherit; cursor: pointer; }
.di-hint { font-size: 13px; color: var(--text2); line-height: 1.5; margin: 6px 0 0; }
.di-status { font-size: 14px; color: var(--text2); padding: 28px 0; text-align: center; }
.di-error { font-size: 13px; color: var(--rose); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.di-inline { text-decoration: none; align-self: flex-start; }
.di-card { border: 1px solid var(--border2); background: var(--surface); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
.di-q { font-size: 16px; font-weight: 700; color: var(--text); }
.di-jobs { display: flex; flex-direction: column; gap: 8px; }
.di-job { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--border2); border-radius: 9px; cursor: pointer; font-size: 13.5px; color: var(--text2); }
.di-job.on { border-color: var(--teal); background: var(--teal-dim); }
.di-job strong { color: var(--text); }
.di-dates { display: block; font-size: 12px; color: var(--text3); margin-top: 2px; }
.di-period { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--text2); }
.di-period input { font: inherit; font-size: 13.5px; color: var(--text); background: var(--bg2); border: 1px solid var(--border2); border-radius: 8px; padding: 8px 10px; }
`
