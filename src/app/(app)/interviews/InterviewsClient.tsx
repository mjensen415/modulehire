'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type App = { id: string; company: string; title: string; status: string; job_description_id: string | null }
type Person = { name: string; title: string | null }
type Interview = {
  id: string
  job_application_id: string | null
  round_name: string
  scheduled_at: string | null
  format: string | null
  interviewers: Person[]
  notes: string | null
  job_applications: App | App[] | null
}
type Draft = {
  job_application_id: string
  round_name: string
  date: string
  time: string
  format: string
  interviewers: Person[]
  notes: string
  source_document_id: string | null
}

const EMPTY: Draft = { job_application_id: '', round_name: '', date: '', time: '', format: '', interviewers: [], notes: '', source_document_id: null }
const appOf = (iv: Interview) => (Array.isArray(iv.job_applications) ? iv.job_applications[0] : iv.job_applications) ?? null

function toLocalParts(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}
function whenText(iso: string | null) {
  if (!iso) return 'Date not set'
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

export default function InterviewsClient({ initialAppId }: { initialAppId: string | null }) {
  const [interviews, setInterviews] = useState<Interview[] | null>(null)
  const [apps, setApps] = useState<App[]>([])
  const [adding, setAdding] = useState<null | 'email' | 'manual'>(initialAppId ? 'manual' : null)
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, job_application_id: initialAppId ?? '' })
  const [emailText, setEmailText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([fetch('/api/interviews').then(r => r.json()), fetch('/api/job-tracker').then(r => r.json())])
      .then(([iv, tr]) => {
        if (!alive) return
        setInterviews(iv.interviews ?? [])
        setApps(tr.applications ?? [])
      })
      .catch(() => { if (alive) { setInterviews([]); setError('We could not load your interviews.') } })
    return () => { alive = false }
  }, [reload])

  const groups = useMemo(() => {
    const list = interviews ?? []
    const now = new Date().getTime()
    const upcoming = list.filter(iv => !iv.scheduled_at || new Date(iv.scheduled_at).getTime() >= now - 2 * 3600_000)
    const past = list.filter(iv => !upcoming.includes(iv)).reverse()
    const byJob = (rows: Interview[]) => {
      const m = new Map<string, { label: string; rows: Interview[] }>()
      for (const iv of rows) {
        const a = appOf(iv)
        const key = a?.id ?? 'none'
        if (!m.has(key)) m.set(key, { label: a ? `${a.title || 'Untitled role'} · ${a.company}` : 'Not linked to a job', rows: [] })
        m.get(key)!.rows.push(iv)
      }
      return [...m.entries()]
    }
    return { upcoming: byJob(upcoming), past: byJob(past) }
  }, [interviews])

  async function readEmail() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/interviews/from-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email_text: emailText }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const x = data.extract
      setDraft({
        job_application_id: data.suggested_job_application_id ?? draft.job_application_id,
        round_name: x.round_name ?? '',
        ...toLocalParts(x.scheduled_at),
        format: x.format ?? '',
        interviewers: x.interviewers ?? [],
        notes: x.notes ?? '',
        source_document_id: data.source_document_id ?? null,
      })
      setAdding('manual') // show the result for confirmation
    } catch (e) {
      setError((e as Error).message || 'We could not read that email.')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true); setError(null)
    try {
      const scheduled = draft.date ? new Date(`${draft.date}T${draft.time || '09:00'}`).toISOString() : null
      const res = await fetch('/api/interviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_application_id: draft.job_application_id || null,
          round_name: draft.round_name,
          scheduled_at: scheduled,
          format: draft.format || null,
          interviewers: draft.interviewers.filter(p => p.name.trim()),
          notes: draft.notes,
          source_document_id: draft.source_document_id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAdding(null); setDraft(EMPTY); setEmailText('')
      setReload(n => n + 1)
    } catch (e) {
      setError((e as Error).message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const setPerson = (i: number, patch: Partial<Person>) =>
    setDraft(d => ({ ...d, interviewers: d.interviewers.map((p, j) => (j === i ? { ...p, ...patch } : p)) }))

  return (
    <div className="warm-inner warm-narrow">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="warm-eyebrow">Interviews</div>
          <h1 className="warm-h1">Every round, prepped</h1>
          <p className="warm-sub">Add a round, see who you&apos;ll meet, and practice answers before you go in.</p>
        </div>
        {!adding && <button type="button" className="warm-btn" onClick={() => { setDraft(EMPTY); setAdding('email') }}>Add a round</button>}
      </header>

      {error && <div className="warm-error" role="alert">{error}</div>}

      {adding && (
        <section className="warm-card iv-add">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2 className="warm-h2" style={{ margin: 0 }}>{draft.source_document_id ? 'Check what we read' : 'Add a round'}</h2>
            {!draft.source_document_id && (
              <div className="warm-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={adding === 'email'} onClick={() => setAdding('email')}>Paste the email</button>
                <button type="button" role="tab" aria-selected={adding === 'manual'} onClick={() => setAdding('manual')}>Enter details</button>
              </div>
            )}
          </div>

          {adding === 'email' ? (
            <>
              <textarea className="warm-input" rows={8} value={emailText} onChange={e => setEmailText(e.target.value)} placeholder="Paste the scheduling email from the recruiter or hiring team." />
              <div className="iv-actions">
                <button type="button" className="warm-btn" disabled={busy || emailText.trim().length < 40} onClick={readEmail}>{busy ? 'Reading…' : 'Read the email'}</button>
                <button type="button" className="warm-btn warm-btn-ghost" onClick={() => setAdding(null)}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <div className="iv-grid">
                <label className="warm-label">Job
                  <select className="warm-input" value={draft.job_application_id} onChange={e => setDraft({ ...draft, job_application_id: e.target.value })}>
                    <option value="">Not linked to a tracked job</option>
                    {apps.map(a => <option key={a.id} value={a.id}>{a.title || 'Untitled role'} · {a.company}</option>)}
                  </select>
                </label>
                <label className="warm-label">Round
                  <input className="warm-input" value={draft.round_name} placeholder="Phone screen" onChange={e => setDraft({ ...draft, round_name: e.target.value })} />
                </label>
                <label className="warm-label">Date
                  <input className="warm-input" type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} />
                </label>
                <label className="warm-label">Time
                  <input className="warm-input" type="time" value={draft.time} onChange={e => setDraft({ ...draft, time: e.target.value })} />
                </label>
                <label className="warm-label">Format
                  <select className="warm-input" value={draft.format} onChange={e => setDraft({ ...draft, format: e.target.value })}>
                    <option value="">Not sure yet</option>
                    <option value="phone">Phone</option>
                    <option value="video">Video</option>
                    <option value="onsite">Onsite</option>
                  </select>
                </label>
              </div>
              <div className="warm-label">People you&apos;ll meet
                {draft.interviewers.map((p, i) => (
                  <div key={i} className="iv-person">
                    <input className="warm-input" value={p.name} placeholder="Name" aria-label="Name" onChange={e => setPerson(i, { name: e.target.value })} />
                    <input className="warm-input" value={p.title ?? ''} placeholder="Title" aria-label="Title" onChange={e => setPerson(i, { title: e.target.value })} />
                    <button type="button" className="warm-btn warm-btn-ghost" aria-label="Remove person" onClick={() => setDraft(d => ({ ...d, interviewers: d.interviewers.filter((_, j) => j !== i) }))}>Remove</button>
                  </div>
                ))}
                <button type="button" className="warm-btn warm-btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setDraft(d => ({ ...d, interviewers: [...d.interviewers, { name: '', title: '' }] }))}>Add a person</button>
              </div>
              <label className="warm-label">Notes
                <textarea className="warm-input" rows={3} value={draft.notes} placeholder="Meeting link, address, what to bring" onChange={e => setDraft({ ...draft, notes: e.target.value })} />
              </label>
              <div className="iv-actions">
                <button type="button" className="warm-btn" disabled={busy || draft.round_name.trim().length === 0} onClick={save}>{busy ? 'Saving…' : 'Save round'}</button>
                <button type="button" className="warm-btn warm-btn-ghost" onClick={() => { setAdding(null); setDraft(EMPTY) }}>Cancel</button>
              </div>
            </>
          )}
        </section>
      )}

      {interviews === null ? (
        <div className="warm-muted">Loading…</div>
      ) : interviews.length === 0 && !adding ? (
        <section className="warm-card">
          <h2 className="warm-h2">No interviews yet</h2>
          <p className="warm-sub">When a company asks to talk, add the round here, or paste their email and we&apos;ll fill it in.</p>
        </section>
      ) : (
        (['upcoming', 'past'] as const).map(which => groups[which].length > 0 && (
          <section key={which}>
            <h2 className="warm-h2">{which === 'upcoming' ? 'Upcoming' : 'Past'}</h2>
            <div className="iv-groups">
              {groups[which].map(([key, g]) => (
                <div key={key} className="warm-card">
                  <div className="iv-job">{g.label}</div>
                  <ul className="iv-rows">
                    {g.rows.map(iv => (
                      <li key={iv.id}>
                        <Link href={`/interviews/${iv.id}`} className="iv-row">
                          <span className="iv-row-main">
                            <span className="iv-round">{iv.round_name}</span>
                            <span className="iv-when">{whenText(iv.scheduled_at)}{iv.format ? ` · ${iv.format}` : ''}{iv.interviewers?.length ? ` · ${iv.interviewers.map(p => p.name).join(', ')}` : ''}</span>
                          </span>
                          <span className="warm-chip">{which === 'upcoming' ? 'Prep' : 'Review'}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
