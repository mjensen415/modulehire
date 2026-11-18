'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { ReviewDraft } from '@/app/api/modules/review-queue/route'

// The library's "To review" queue: parsed modules wait here as drafts until the user confirms
// them. Nothing in it is used on a resume, in matching, outreach or interview prep.
// `limit` + `compact` render the short version on the home page.
type Props = {
  limit?: number
  compact?: boolean
  /** Called after any confirm / edit / reject so the parent can reload its own data. */
  onChange?: () => void
}

export default function ReviewQueue({ limit, compact = false, onChange }: Props) {
  const [drafts, setDrafts] = useState<ReviewDraft[]>([])
  const [total, setTotal] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ id: string; title: string; content: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const GROUP_PREVIEW = 6

  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    let alive = true
    fetch(`/api/modules/review-queue${limit ? `?limit=${limit}` : ''}`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        if (!alive) return
        setDrafts(data.drafts ?? [])
        setTotal(data.total ?? 0)
      })
      .catch(() => { if (alive) setError("We couldn't load the modules waiting for review.") })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [limit, reloadKey])

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; source: ReviewDraft['source']; items: ReviewDraft[] }>()
    for (const d of drafts) {
      const key = `${d.source.kind}:${d.source.id ?? ''}`
      if (!map.has(key)) map.set(key, { key, label: d.source.label, source: d.source, items: [] })
      map.get(key)!.items.push(d)
    }
    return [...map.values()]
  }, [drafts])

  function settle(ids: string[]) {
    setDrafts(ds => ds.filter(d => !ids.includes(d.id)))
    setTotal(t => Math.max(0, t - ids.length))
    onChange?.()
  }

  async function withBusy(ids: string[], fn: () => Promise<Response>) {
    setError(null)
    setBusy(b => new Set([...b, ...ids]))
    try {
      const res = await fn()
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error)
      settle(ids)
    } catch (e) {
      setError((e as Error).message || 'That did not save. Try again.')
    } finally {
      setBusy(b => { const n = new Set(b); ids.forEach(id => n.delete(id)); return n })
    }
  }

  const confirm = (id: string) => withBusy([id], () => fetch(`/api/modules/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'confirmed' }),
  }))
  const reject = (id: string) => withBusy([id], () => fetch(`/api/modules/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected' }),
  }))
  const saveAndConfirm = () => {
    if (!editing) return
    const { id, title, content } = editing
    if (!title.trim() || !content.trim()) { setError('A module needs a title and some text.'); return }
    return withBusy([id], async () => {
      const res = await fetch(`/api/modules/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content: content.trim(), status: 'confirmed' }),
      })
      if (res.ok) setEditing(null)
      return res
    })
  }
  const confirmGroup = (g: typeof groups[number]) => {
    const ids = g.items.map(d => d.id)
    const body = g.source.kind === 'document' ? { source_document_id: g.source.id }
      : g.source.kind === 'resume' ? { source_resume_id: g.source.id }
      : { ids }
    return withBusy(ids, async () => {
      const res = await fetch('/api/modules/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      // The whole upload was confirmed, including drafts not shown on this page.
      if (res.ok && !limit) setReloadKey(k => k + 1)
      return res
    })
  }

  if (!loaded || (total === 0 && !error)) return null

  return (
    <section className={`rq${compact ? ' rq-compact' : ''}`} id="review">
      <style>{RQ_CSS}</style>
      {!compact && (
        <div className="rq-head">
          <div>
            <h2 className="rq-title">To review ({total})</h2>
            <p className="rq-sub">We pulled these from your documents. Nothing here goes on a resume until you confirm it.</p>
          </div>
        </div>
      )}
      {error && <div className="rq-error">{error}</div>}

      {groups.map(g => (
        <div key={g.key} className="rq-group">
          {!compact && (
            <div className="rq-group-head">
              <span className="rq-group-label">From {g.label}</span>
              {g.source.kind !== 'none' && (
                <button type="button" className="rq-btn" onClick={() => confirmGroup(g)} disabled={g.items.some(d => busy.has(d.id))}>
                  Confirm all from this upload
                </button>
              )}
            </div>
          )}
          <ul className="rq-list">
            {(compact || expanded.has(g.key) ? g.items : g.items.slice(0, GROUP_PREVIEW)).map(d => {
              const isEditing = editing?.id === d.id
              const isBusy = busy.has(d.id)
              return (
                <li key={d.id} className="rq-card">
                  {isEditing ? (
                    <div className="rq-edit">
                      <input
                        className="rq-input"
                        value={editing.title}
                        onChange={e => setEditing({ ...editing, title: e.target.value })}
                        aria-label="Module title"
                      />
                      <textarea
                        className="rq-input"
                        rows={4}
                        value={editing.content}
                        onChange={e => setEditing({ ...editing, content: e.target.value })}
                        aria-label="Module text"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="rq-card-title">{d.title}</div>
                      {(d.source_company || d.source_role_title) && (
                        <div className="rq-meta">{[d.source_role_title, d.source_company].filter(Boolean).join(' at ')}</div>
                      )}
                      <p className="rq-content">{d.content}</p>
                    </>
                  )}
                  <div className="rq-quote">
                    From: {d.source.label}
                    {d.source_quote ? <> · <q>{d.source_quote}</q></> : <> · <span className="rq-noquote">no matching line found, check it against your document</span></>}
                  </div>
                  <div className="rq-actions">
                    {isEditing ? (
                      <>
                        <button type="button" className="rq-btn rq-btn-primary" onClick={saveAndConfirm} disabled={isBusy}>Save and confirm</button>
                        <button type="button" className="rq-btn" onClick={() => setEditing(null)} disabled={isBusy}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="rq-btn rq-btn-primary" onClick={() => confirm(d.id)} disabled={isBusy}>Confirm</button>
                        <button type="button" className="rq-btn" onClick={() => setEditing({ id: d.id, title: d.title, content: d.content })} disabled={isBusy}>Edit</button>
                        <button type="button" className="rq-btn rq-reject" onClick={() => reject(d.id)} disabled={isBusy}>Not true</button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {!compact && !expanded.has(g.key) && g.items.length > GROUP_PREVIEW && (
            <button type="button" className="rq-showall" onClick={() => setExpanded(e => new Set([...e, g.key]))}>
              Show all {g.items.length} from {g.label}
            </button>
          )}
        </div>
      ))}
      {compact && total > drafts.length && (
        <Link href="/library#review" className="rq-more">See all {total} in your library</Link>
      )}
    </section>
  )
}

const RQ_CSS = `
.rq { margin: 16px 20px 4px; padding: 16px 18px; border: 1px solid var(--amber); border-radius: 12px; background: var(--amber-dim); }
.rq-compact { margin: 0; padding: 0; border: none; background: none; }
.rq-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
.rq-title { font-size: 16px; font-weight: 700; color: var(--text); margin: 0; }
.rq-sub { font-size: 13px; color: var(--text2); margin: 4px 0 0; }
.rq-error { font-size: 13px; color: var(--rose); margin: 6px 0; }
.rq-group + .rq-group { margin-top: 14px; }
.rq-group-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.rq-group-label { font-size: 12px; font-weight: 600; color: var(--text2); }
.rq-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.rq-compact .rq-list { grid-template-columns: 1fr; }
.rq-card { background: var(--surface); border: 1px solid var(--border2); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.rq-card-title { font-size: 14px; font-weight: 600; color: var(--text); }
.rq-meta { font-size: 12px; color: var(--text3); }
.rq-content { font-size: 13px; color: var(--text2); line-height: 1.5; margin: 0; }
.rq-quote { font-size: 12px; color: var(--text3); line-height: 1.45; overflow-wrap: anywhere; }
.rq-quote q { font-style: italic; color: var(--text2); }
.rq-noquote { color: var(--amber); }
.rq-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
.rq-btn { font: inherit; font-size: 12.5px; font-weight: 600; padding: 6px 12px; border-radius: 7px; border: 1px solid var(--border2); background: var(--surface); color: var(--text2); cursor: pointer; white-space: nowrap; }
.rq-btn:hover:not(:disabled) { color: var(--text); border-color: var(--text3); }
.rq-btn:disabled { opacity: 0.5; cursor: default; }
.rq-btn-primary { background: var(--teal); border-color: var(--teal); color: #fff; }
.rq-btn-primary:hover:not(:disabled) { color: #fff; opacity: 0.9; }
.rq-reject { color: var(--rose); }
.rq-showall { font: inherit; font-size: 13px; color: var(--teal); background: none; border: none; padding: 8px 0 0; cursor: pointer; }
.rq-edit { display: flex; flex-direction: column; gap: 6px; }
.rq-input { width: 100%; font: inherit; font-size: 13px; color: var(--text); background: var(--bg2); border: 1px solid var(--border2); border-radius: 8px; padding: 8px 10px; box-sizing: border-box; }
.rq-more { font-size: 13px; color: var(--teal); text-decoration: none; display: inline-block; margin-top: 8px; }
`
