'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { FileItem } from '@/app/api/files/route'

const FILTERS: Array<{ key: string; label: string; kinds: string[] }> = [
  { key: 'all', label: 'All', kinds: [] },
  { key: 'resume', label: 'Resumes', kinds: ['resume'] },
  { key: 'review', label: 'Performance reviews', kinds: ['performance_review'] },
  { key: 'email', label: 'Interview emails', kinds: ['interview_email'] },
  { key: 'tailored', label: 'Tailored resumes', kinds: ['generated_resume'] },
  { key: 'other', label: 'Other', kinds: ['brag_doc', 'other'] },
]

const CHIP_TONE: Record<string, string> = {
  resume: 'var(--h-sage)', performance_review: 'var(--h-peach)', interview_email: 'var(--h-lavender)',
  generated_resume: 'var(--h-butter)', brag_doc: 'var(--h-card2)', other: 'var(--h-card2)',
}

export default function FilesClient() {
  const [files, setFiles] = useState<FileItem[] | null>(null)
  const [filter, setFilter] = useState('all')
  const [confirming, setConfirming] = useState<FileItem | null>(null)
  const [keepModules, setKeepModules] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    fetch('/api/files')
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d })
      .then(d => { if (alive) setFiles(d.files ?? []) })
      .catch(e => { if (alive) { setFiles([]); setError((e as Error).message || 'Could not load your files.') } })
    return () => { alive = false }
  }, [reload])

  const shown = useMemo(() => {
    const f = FILTERS.find(x => x.key === filter)
    return (files ?? []).filter(i => !f || f.kinds.length === 0 || f.kinds.includes(i.kind))
  }, [files, filter])

  async function remove(item: FileItem) {
    setBusy(true); setError(null)
    try {
      const res = item.type === 'generated'
        ? await fetch('/api/my-resumes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) })
        : await fetch(`/api/documents/${item.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keep_modules: keepModules }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error)
      setConfirming(null)
      setReload(n => n + 1)
    } catch (e) {
      setError((e as Error).message || 'Could not delete it.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="warm-inner warm-narrow">
      <header>
        <div className="warm-eyebrow">Files</div>
        <h1 className="warm-h1">Everything you&apos;ve added</h1>
        <p className="warm-sub">Your uploads, interview emails and tailored resumes. Download or delete anything, anytime.</p>
      </header>

      <div className="warm-tabs fl-filters" role="tablist" aria-label="Filter files">
        {FILTERS.map(f => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      {error && <div className="warm-error" role="alert">{error}</div>}

      {files === null ? (
        <div className="warm-muted">Loading…</div>
      ) : shown.length === 0 ? (
        <section className="warm-card">
          <p className="warm-sub">
            {files.length === 0 ? <>Nothing here yet. <Link href="/upload" className="warm-link">Upload your resume or a performance review</Link>.</> : 'No files of this kind.'}
          </p>
        </section>
      ) : (
        <ul className="warm-card fl-list">
          {shown.map(item => (
            <li key={`${item.type}:${item.id}`} className="fl-row">
              <span className="warm-chip fl-chip" style={{ background: CHIP_TONE[item.kind] }}>{item.kind_label}</span>
              <div className="fl-main">
                {item.href ? <Link href={item.href} className="fl-name">{item.name}</Link> : <span className="fl-name">{item.name}</span>}
                <span className="fl-meta">
                  {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  {item.job ? ` · ${item.job}` : ''}
                  {item.module_count > 0 ? ` · ${item.module_count} module${item.module_count === 1 ? '' : 's'}` : ''}
                </span>
              </div>
              <div className="fl-actions">
                <a className="warm-btn warm-btn-ghost fl-btn" href={`/api/files/download?type=${item.type}&id=${item.id}`}>Download</a>
                <button type="button" className="warm-btn warm-btn-danger fl-btn" onClick={() => { setConfirming(item); setKeepModules(true) }}>Delete</button>
              </div>

              {confirming?.id === item.id && (
                <div className="fl-confirm" role="dialog" aria-label={`Delete ${item.name}`}>
                  <div style={{ fontWeight: 700 }}>Delete {item.name}?</div>
                  {item.type === 'document' ? (
                    <>
                      <p className="warm-sub" style={{ fontSize: 13.5 }}>The file and its text are removed.</p>
                      {item.module_count > 0 && (
                        <fieldset className="fl-choice">
                          <legend className="warm-sub" style={{ fontSize: 13.5 }}>{item.module_count} module{item.module_count === 1 ? ' was' : 's were'} made from it.</legend>
                          <label><input type="radio" name={`keep-${item.id}`} checked={keepModules} onChange={() => setKeepModules(true)} /> Keep the modules in my library</label>
                          <label><input type="radio" name={`keep-${item.id}`} checked={!keepModules} onChange={() => setKeepModules(false)} /> Delete them too</label>
                        </fieldset>
                      )}
                    </>
                  ) : (
                    <p className="warm-sub" style={{ fontSize: 13.5 }}>The tailored resume is removed from your list. Your modules aren&apos;t affected.</p>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="warm-btn" disabled={busy} onClick={() => remove(item)}>{busy ? 'Deleting…' : 'Delete'}</button>
                    <button type="button" className="warm-btn warm-btn-ghost" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
