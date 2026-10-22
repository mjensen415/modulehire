'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Stage = 'basics' | 'criteria' | 'match' | 'document'
type Phase = 'paste' | 'building' | 'needTitle' | 'error'

const STAGES: { key: Stage; label: string }[] = [
  { key: 'basics', label: 'Reading the posting' },
  { key: 'criteria', label: "Pulling out what they're asking for" },
  { key: 'match', label: 'Picking your best modules' },
  { key: 'document', label: 'Writing your resume' },
]

const looksLikeUrl = (text: string) => /^https?:\/\/\S+$/i.test(text.trim())

// v2: paste a posting → Building (~20s) → the resume, open for editing on /resumes/[id].
// No wizard: modules are picked for you, and everything the old Match step did lives in the
// editor's rail. /generate?classic=1 still serves the old flow for one release.
export default function GenerateV2({ initialJdId }: { initialJdId: string | null }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('paste')
  const [text, setText] = useState('')
  const [done, setDone] = useState<Set<Stage>>(new Set())
  const [current, setCurrent] = useState<Stage>('basics')
  const [job, setJob] = useState<{ jd_id: string; title: string; company: string } | null>(null)
  const [details, setDetails] = useState<{ criteria?: number; picked?: number }>({})
  const [error, setError] = useState<{ message: string; code?: string } | null>(null)
  const [titleInput, setTitleInput] = useState('')
  const [companyInput, setCompanyInput] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const startedRef = useRef(false)

  // Seconds since Building started — shown as plain elapsed time, never as fake progress.
  useEffect(() => {
    if (phase !== 'building') return
    const started = Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(t)
  }, [phase])

  const start = async (body: { raw_text?: string; url?: string; jd_id?: string }) => {
    setPhase('building')
    setElapsed(0)
    setError(null)
    setDone(new Set())
    setCurrent('basics')
    setDetails({})
    const mark = (stage: Stage, next?: Stage) => {
      setDone(prev => new Set(prev).add(stage))
      if (next) setCurrent(next)
    }
    try {
      const res = await fetch('/api/jobs/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        throw Object.assign(new Error(data.error ?? 'Something went wrong. Try again.'), { code: data.code })
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done: finished, value } = await reader.read()
        if (finished) break
        buf += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          const msg = JSON.parse(line)
          if (msg.type === 'basics') {
            setJob({ jd_id: msg.jd_id, title: msg.title, company: msg.company })
            mark('basics', 'criteria')
          } else if (msg.type === 'criteria') {
            setDetails(d => ({ ...d, criteria: msg.count }))
            mark('criteria', 'match')
          } else if (msg.type === 'match') {
            setDetails(d => ({ ...d, picked: msg.picked }))
            mark('match', 'document')
          } else if (msg.type === 'document') {
            mark('document')
            router.push(`/resumes/${msg.resume_id}`)
            return
          } else if (msg.type === 'need_title') {
            setJob(j => ({ jd_id: msg.jd_id, title: '', company: msg.company ?? j?.company ?? '' }))
            setCompanyInput(msg.company ?? '')
            setPhase('needTitle')
            return
          } else if (msg.type === 'error') {
            throw Object.assign(new Error(msg.message), { code: msg.code })
          }
        }
      }
      throw new Error('The draft didn\'t finish. Try again.')
    } catch (e) {
      setError({ message: (e as Error).message, code: (e as Error & { code?: string }).code })
      setPhase('error')
    }
  }

  // "Make another version" / "Regenerate" links arrive as /generate?jd_id=… — start right away.
  useEffect(() => {
    if (!initialJdId || startedRef.current) return
    startedRef.current = true
    void start({ jd_id: initialJdId })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJdId])

  const submit = () => {
    const value = text.trim()
    if (looksLikeUrl(value)) void start({ url: value })
    else if (value.length >= 50) void start({ raw_text: value })
  }

  const continueWithTitle = async () => {
    if (!job || titleInput.trim().length < 2) return
    const res = await fetch(`/api/job-descriptions/${job.jd_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extracted_job_title: titleInput.trim(), extracted_company: companyInput.trim() || null }),
    })
    if (!res.ok) { setError({ message: 'Couldn\'t save the title. Try again.' }); return }
    setJob({ ...job, title: titleInput.trim(), company: companyInput.trim() })
    void start({ jd_id: job.jd_id })
  }

  const canSubmit = looksLikeUrl(text) || text.trim().length >= 50

  return (
    <div className="dash-content" style={{ maxWidth: 680, margin: '0 auto', width: '100%', padding: '48px 24px' }}>
      <style>{GEN_CSS}</style>

      {phase === 'paste' && (
        <>
          <h1 className="page-title">Make a resume for a job</h1>
          <p className="page-sub" style={{ marginBottom: 20 }}>
            Paste the job posting, or its link. We&apos;ll pick your best modules and write a draft you can edit.
          </p>
          <textarea
            className="form-input"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) submit() }}
            placeholder="Paste the full job posting here, or a link to it"
            aria-label="Job posting text or link"
            autoFocus
            style={{ minHeight: 260, fontSize: 13.5, lineHeight: 1.55, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" onClick={submit} disabled={!canSubmit}>
              Make my resume
            </button>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>
              {text.trim() && !canSubmit ? 'Paste a bit more of the posting' : 'About 20 seconds'}
            </span>
          </div>
        </>
      )}

      {phase === 'building' && (
        <div className="gv2-building" aria-live="polite">
          <div className="gv2-eyebrow">Building your resume</div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>
            {job?.title || 'Reading the posting…'}
          </h1>
          {job?.company && <div className="page-sub" style={{ marginBottom: 0 }}>{job.company}</div>}

          <ol className="gv2-stages">
            {STAGES.map(s => {
              const isDone = done.has(s.key)
              const isCurrent = !isDone && current === s.key
              const note = s.key === 'criteria' && details.criteria ? `${details.criteria} requirements`
                : s.key === 'match' && details.picked ? `${details.picked} modules`
                : ''
              return (
                <li key={s.key} className={`gv2-stage${isDone ? ' done' : ''}${isCurrent ? ' current' : ''}`}>
                  <span className="gv2-dot" aria-hidden>{isDone ? '✓' : ''}</span>
                  <span className="gv2-label">{s.label}</span>
                  {note && <span className="gv2-note">{note}</span>}
                </li>
              )
            })}
          </ol>
          <div className="gv2-bar" aria-hidden>
            <div style={{ width: `${(done.size / STAGES.length) * 100}%` }} />
          </div>
          <div className="gv2-elapsed">{elapsed}s · usually about 20 seconds</div>
        </div>
      )}

      {phase === 'needTitle' && job && (
        <div className="gv2-card">
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>We couldn&apos;t find a job title in this posting</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 14px' }}>What&apos;s the role called? It goes on your resume header.</div>
          <input
            className="form-input"
            placeholder="Head of Community"
            value={titleInput}
            onChange={e => setTitleInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void continueWithTitle() }}
            autoFocus
            style={{ fontSize: 13.5, marginBottom: 8 }}
          />
          <input
            className="form-input"
            placeholder="Company (optional)"
            value={companyInput}
            onChange={e => setCompanyInput(e.target.value)}
            style={{ fontSize: 13.5 }}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
            <button type="button" className="btn-primary" onClick={continueWithTitle} disabled={titleInput.trim().length < 2}>
              Continue
            </button>
            {error && <span style={{ fontSize: 12.5, color: 'var(--rose)' }}>{error.message}</span>}
          </div>
        </div>
      )}

      {phase === 'error' && error && (
        <div className="gv2-card">
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>We couldn&apos;t finish your draft</div>
          <div style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 14 }}>{error.message}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {error.code === 'monthly_generation_limit' ? (
              <Link href="/pricing" className="btn-primary" style={{ textDecoration: 'none' }}>See plans</Link>
            ) : (
              <button type="button" className="btn-primary" onClick={() => (job ? start({ jd_id: job.jd_id }) : setPhase('paste'))}>Try again</button>
            )}
            <button type="button" className="btn-ghost" onClick={() => { setPhase('paste'); setJob(null) }}>Paste a different posting</button>
          </div>
        </div>
      )}
    </div>
  )
}

const GEN_CSS = `
.gv2-building { display: flex; flex-direction: column; }
.gv2-eyebrow { font-size: 12px; font-weight: 600; color: var(--teal); margin-bottom: 8px; }
.gv2-stages { list-style: none; margin: 28px 0 18px; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.gv2-stage { display: flex; align-items: center; gap: 12px; font-size: 14px; color: var(--text3); }
.gv2-stage.current { color: var(--text); font-weight: 600; }
.gv2-stage.done { color: var(--text2); }
.gv2-dot { width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid var(--border2); display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.gv2-stage.done .gv2-dot { background: var(--teal); border-color: var(--teal); color: #fff; }
.gv2-stage.current .gv2-dot { border-color: var(--teal); animation: gv2-pulse 1.2s ease-in-out infinite; }
.gv2-note { font-size: 12px; color: var(--text3); font-weight: 400; }
.gv2-bar { height: 3px; background: var(--bg3); border-radius: 999px; overflow: hidden; }
.gv2-bar div { height: 100%; background: var(--teal); border-radius: 999px; transition: width 0.4s ease; }
.gv2-elapsed { font-size: 12px; color: var(--text3); margin-top: 10px; font-variant-numeric: tabular-nums; }
.gv2-card { background: var(--surface); border: 1px solid var(--border2); border-radius: 12px; padding: 22px 24px; }
@keyframes gv2-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(29,158,117,0.35); } 50% { box-shadow: 0 0 0 5px rgba(29,158,117,0); } }
@media (prefers-reduced-motion: reduce) { .gv2-stage.current .gv2-dot { animation: none; } }
`
