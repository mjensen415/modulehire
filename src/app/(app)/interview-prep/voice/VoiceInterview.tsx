'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Conversation, type Mode } from '@elevenlabs/react'
import type { VoiceFeedback } from '@/lib/voice/interview'
import GrantBadge from '@/components/GrantBadge'
import SprintButton from '@/components/SprintButton'
import './voice.css'

type Job = { id: string; label: string }
type SessionSummary = {
  id: string
  job_description_id: string | null
  interview_type: string
  length_minutes: number
  status: string
  duration_s: number | null
  overall_score: number | null
  created_at: string
}
type StatusResp = {
  enabled: boolean
  is_pro: boolean
  monthly_limit: number
  used_this_month: number
  consent_version: string
  sessions: SessionSummary[]
}
type Turn = { role: 'user' | 'agent'; message: string }
type Phase = 'setup' | 'connecting' | 'live' | 'scoring' | 'feedback'

const TYPES = [
  { key: 'recruiter_screen', label: 'Recruiter screen', sample: 'Walk me through your background. Why this role, and why now?' },
  { key: 'behavioral', label: 'Hiring manager', sample: 'Tell me about a time you had to win over a skeptical stakeholder.' },
  { key: 'deep_dive', label: 'Role deep dive', sample: 'How would you spend your first 90 days in this job?' },
] as const
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.key, t.label]))
const CONSENT_KEY = 'mh-voice-consent'

// The SDK plays the interviewer through a hidden <audio> element it creates after connecting and
// relies on autoplay. Browsers block that when the click that started the call was too long ago
// (we await the mic prompt and our API first), so the text arrives with no sound. Play it
// ourselves, and if the browser still refuses, show a button: a click is always allowed.
async function startInterviewerAudio(): Promise<boolean> {
  const els = Array.from(document.querySelectorAll('audio')).filter((a) => a.srcObject instanceof MediaStream)
  if (!els.length) return false
  const results = await Promise.all(els.map((a) => (a.paused ? a.play().then(() => true, () => false) : Promise.resolve(true))))
  return results.every(Boolean)
}

function fmt(s: number) {
  const m = Math.floor(Math.max(0, s) / 60)
  return `${m}:${String(Math.max(0, s) % 60).padStart(2, '0')}`
}

function scoreTone(n: number) {
  return n >= 75 ? 'good' : n >= 50 ? 'ok' : 'low'
}

type Conv = Awaited<ReturnType<typeof Conversation.startSession>>

export default function VoiceInterview({ jobs, initialJdId, initialSessionId }: { jobs: Job[]; initialJdId: string | null; initialSessionId: string | null }) {
  const [status, setStatus] = useState<StatusResp | null>(null)
  const [jdId, setJdId] = useState<string>(initialJdId && jobs.some((j) => j.id === initialJdId) ? initialJdId : jobs[0]?.id ?? '')
  const [type, setType] = useState<string>('behavioral')
  const [length, setLength] = useState<10 | 20>(10)
  const [consent, setConsent] = useState(false)
  const [phase, setPhase] = useState<Phase>('setup')
  const [error, setError] = useState('')
  const [mode, setMode] = useState<Mode>('listening')
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [turns, setTurns] = useState<Turn[]>([])
  const [feedback, setFeedback] = useState<VoiceFeedback | null>(null)
  const [feedbackNote, setFeedbackNote] = useState('')
  const [viewTranscript, setViewTranscript] = useState<Turn[] | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [maxSeconds, setMaxSeconds] = useState(600)
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [sessionMeta, setSessionMeta] = useState<{ jobTitle: string; company: string; type: string } | null>(null)

  const convRef = useRef<Conv | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const maxSecondsRef = useRef(600)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const finishingRef = useRef(false)
  const orbRef = useRef<HTMLDivElement | null>(null)
  const captionsRef = useRef<HTMLDivElement | null>(null)

  async function loadStatus() {
    const res = await fetch('/api/interview/voice')
    if (res.ok) {
      const data: StatusResp = await res.json()
      setStatus(data)
      try {
        if (localStorage.getItem(CONSENT_KEY) === data.consent_version) setConsent(true)
      } catch { /* storage unavailable */ }
    }
  }

  async function openSession(id: string) {
    const res = await fetch(`/api/interview/voice/${id}`)
    if (!res.ok) return
    const data = await res.json()
    setActiveSessionId(id)
    setFeedback(data.feedback ?? null)
    setFeedbackNote(data.feedback ? '' : data.status === 'failed' ? 'Scoring failed for this session.' : 'This session was too short to score. Answer at least two questions next time.')
    setViewTranscript((data.transcript ?? []).filter((t: Turn) => t.message))
    setPhase('feedback')
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    loadStatus()
    if (initialSessionId) openSession(initialSessionId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    convRef.current?.endSession().catch(() => null)
  }, [])

  // The orb follows the real audio levels: teal for the interviewer, indigo for the candidate.
  // Written straight to CSS variables each frame so React doesn't re-render 60 times a second.
  useEffect(() => {
    if (phase !== 'live') return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let out = 0
    let inp = 0
    const tick = () => {
      const c = convRef.current
      if (c && orbRef.current) {
        out += ((c.getOutputVolume?.() ?? 0) - out) * 0.25
        inp += ((c.getInputVolume?.() ?? 0) - inp) * 0.25
        const el = orbRef.current
        el.style.setProperty('--out', reduce ? '0' : Math.min(1, out * 1.6).toFixed(3))
        el.style.setProperty('--in', reduce ? '0' : Math.min(1, inp * 2.2).toFixed(3))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  useEffect(() => {
    captionsRef.current?.scrollTo({ top: captionsRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  async function finish() {
    if (finishingRef.current) return
    finishingRef.current = true
    if (timerRef.current) clearInterval(timerRef.current)
    const sessionId = sessionIdRef.current
    const conversationId = conversationIdRef.current
    convRef.current = null
    if (!sessionId || !conversationId) {
      setPhase('setup')
      setError('The call ended before it connected. Try again.')
      finishingRef.current = false
      return
    }
    setPhase('scoring')
    try {
      const res = await fetch(`/api/interview/voice/${sessionId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId }),
      })
      const data = await res.json().catch(() => ({}))
      setActiveSessionId(sessionId)
      if (!res.ok) {
        setFeedback(null)
        setFeedbackNote(data.error || 'Could not score this interview.')
      } else {
        setFeedback(data.feedback ?? null)
        setFeedbackNote(data.note ?? '')
      }
      setViewTranscript(null)
      setPhase('feedback')
      loadStatus()
    } finally {
      finishingRef.current = false
    }
  }

  async function start() {
    setError('')
    if (!jdId) return setError('Pick a job first.')
    setPhase('connecting')
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setPhase('setup')
      return setError('Microphone access is blocked. Allow it in your browser’s site settings, then start again.')
    }
    try { localStorage.setItem(CONSENT_KEY, status?.consent_version ?? '') } catch { /* ignore */ }

    const res = await fetch('/api/interview/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_description_id: jdId,
        interview_type: type,
        length_minutes: length,
        consent: true,
        consent_version: status?.consent_version,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setPhase('setup')
      return setError(data.error === 'pro_required' ? 'Voice interviews are part of a Sprint.' : data.error || 'Could not start the interview.')
    }

    sessionIdRef.current = data.session_id
    conversationIdRef.current = null
    maxSecondsRef.current = data.max_seconds
    setMaxSeconds(data.max_seconds)
    setSessionMeta({ jobTitle: data.job_title, company: data.company, type })
    setTurns([])
    setAudioBlocked(false)
    setElapsed(0)
    setMuted(false)
    try {
      convRef.current = await Conversation.startSession({
        signedUrl: data.signed_url,
        connectionType: 'websocket',
        dynamicVariables: data.dynamic_variables,
        onConnect: ({ conversationId }) => {
          conversationIdRef.current = conversationId
          setPhase('live')
          setTimeout(() => { startInterviewerAudio().then((ok) => setAudioBlocked(!ok)) }, 300)
          const startedAt = Date.now()
          timerRef.current = setInterval(() => {
            const s = Math.floor((Date.now() - startedAt) / 1000)
            setElapsed(s)
            // The interviewer wraps up on its own; this is the hard stop 30s past the slot.
            if (s >= maxSecondsRef.current + 30) convRef.current?.endSession().catch(() => null)
          }, 1000)
        },
        onDisconnect: () => { finish() },
        onError: (message) => { console.error('[voice]', message) },
        onModeChange: ({ mode }) => {
          setMode(mode)
          if (mode === 'speaking') startInterviewerAudio().then((ok) => setAudioBlocked(!ok))
        },
        onMessage: ({ message, role }) => {
          if (!message?.trim()) return
          setTurns((prev) => [...prev, { role, message }].slice(-40))
        },
      })
      if (!conversationIdRef.current) conversationIdRef.current = convRef.current.getId()
    } catch (e) {
      console.error(e)
      setPhase('setup')
      setError('Could not connect to the interviewer. Check your connection and start again.')
    }
  }

  async function end() {
    await convRef.current?.endSession().catch(() => null)
  }

  function toggleMute() {
    const next = !muted
    convRef.current?.setMicMuted(next)
    setMuted(next)
  }

  async function remove(id: string) {
    if (!confirm('Delete this interview and its transcript? This also deletes it from ElevenLabs.')) return
    await fetch(`/api/interview/voice/${id}`, { method: 'DELETE' })
    if (activeSessionId === id) {
      setPhase('setup')
      setFeedback(null)
      setActiveSessionId(null)
    }
    loadStatus()
  }

  if (!status) return <div className="vi"><p className="vi-muted">Loading…</p></div>

  const left = Math.max(0, status.monthly_limit - status.used_this_month)
  const history = status.sessions.filter((s) => !jdId || s.job_description_id === jdId)
  const job = jobs.find((j) => j.id === jdId)
  const typeInfo = TYPES.find((t) => t.key === type) ?? TYPES[1]

  // ─── Live ────────────────────────────────────────────────────────────────
  if (phase === 'connecting' || phase === 'live') {
    const remaining = maxSeconds - elapsed
    const progress = Math.min(1, elapsed / Math.max(1, maxSeconds))
    const R = 140
    const C = 2 * Math.PI * R
    const lastAgent = [...turns].reverse().find((t) => t.role === 'agent')
    const stateLabel = phase === 'connecting'
      ? 'Connecting to your interviewer'
      : mode === 'speaking' ? 'Interviewer is speaking' : muted ? 'You’re muted' : 'Your turn. Take your time.'
    return (
      <div className="vi vi-room">
        <div className="vi-stage">
          <div className="vi-stage-head">
            <div>
              <div className="vi-stage-title">{sessionMeta?.jobTitle}{sessionMeta?.company ? ` at ${sessionMeta.company}` : ''}</div>
              <div className="vi-muted">{TYPE_LABEL[sessionMeta?.type ?? ''] ?? 'Interview'} practice with an AI interviewer</div>
            </div>
            <div className={`vi-clock${remaining < 60 && phase === 'live' ? ' is-late' : ''}`}>
              {phase === 'live' ? (remaining >= 0 ? fmt(remaining) : 'Wrapping up') : '--:--'}
            </div>
          </div>

          <div className="vi-orb-wrap">
            <svg className="vi-ring" viewBox="0 0 300 300" aria-hidden="true">
              <circle cx="150" cy="150" r={R} className="vi-ring-track" />
              <circle cx="150" cy="150" r={R} className="vi-ring-fill" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
            </svg>
            <div ref={orbRef} className={`vi-orb is-${phase === 'connecting' ? 'connecting' : mode}${muted ? ' is-muted' : ''}`}>
              <span className="vi-orb-in" />
              <span className="vi-orb-out" />
              <span className="vi-orb-core" />
            </div>
          </div>

          <div className="vi-state" role="status">{stateLabel}</div>
          <p className="vi-line">{lastAgent ? lastAgent.message : ' '}</p>

          {audioBlocked && phase === 'live' && (
            <button className="vi-btn vi-btn-primary" onClick={() => startInterviewerAudio().then((ok) => setAudioBlocked(!ok))}>
              Turn on interviewer audio
            </button>
          )}

          <div className="vi-controls">
            <button className="vi-btn" onClick={toggleMute} disabled={phase !== 'live'} aria-pressed={muted}>
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button className="vi-btn vi-btn-end" onClick={end}>End interview</button>
          </div>
        </div>

        <aside className="vi-captions" aria-label="Live captions">
          <div className="vi-captions-head">Captions</div>
          <div ref={captionsRef} className="vi-captions-list">
            {turns.length === 0 && <p className="vi-muted">What you and the interviewer say shows up here.</p>}
            {turns.map((t, i) => (
              <div key={i} className={`vi-turn is-${t.role}`}>
                <span className="vi-turn-who">{t.role === 'agent' ? 'Interviewer' : 'You'}</span>
                <span>{t.message}</span>
              </div>
            ))}
          </div>
          <p className="vi-fine">You&apos;re talking to an AI. Audio is processed by ElevenLabs and not stored by ModuleHire.</p>
        </aside>
      </div>
    )
  }

  if (phase === 'scoring') {
    return (
      <div className="vi">
        <div className="vi-scoring">
          <div className="vi-orb is-thinking"><span className="vi-orb-core" /></div>
          <h2>Reviewing your answers</h2>
          <p className="vi-muted">Checking each answer against your library. This takes about a minute.</p>
        </div>
      </div>
    )
  }

  // ─── Feedback ────────────────────────────────────────────────────────────
  if (phase === 'feedback') {
    const R = 46
    const C = 2 * Math.PI * R
    return (
      <div className="vi vi-report">
        <div className="vi-report-actions">
          <button className="vi-btn" onClick={() => { setPhase('setup'); setFeedback(null) }}>Practice again</button>
          {activeSessionId && <button className="vi-btn vi-btn-quiet" onClick={() => remove(activeSessionId)}>Delete this session</button>}
        </div>

        {!feedback ? (
          <div className="vi-panel"><p>{feedbackNote || 'No feedback yet.'}</p></div>
        ) : (
          <>
            <section className="vi-panel vi-summary">
              <div className={`vi-score is-${scoreTone(feedback.overall_score)}`}>
                <svg viewBox="0 0 110 110" aria-hidden="true">
                  <circle cx="55" cy="55" r={R} className="vi-score-track" />
                  <circle cx="55" cy="55" r={R} className="vi-score-fill" strokeDasharray={C} strokeDashoffset={C * (1 - feedback.overall_score / 100)} />
                </svg>
                <span className="vi-score-num">{feedback.overall_score}</span>
              </div>
              <div>
                <h2>How it went</h2>
                <p>{feedback.summary}</p>
              </div>
            </section>

            <div className="vi-two">
              {feedback.strengths.length > 0 && (
                <section className="vi-panel vi-list is-good">
                  <h3>What worked</h3>
                  <ul>{feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </section>
              )}
              {feedback.improvements.length > 0 && (
                <section className="vi-panel vi-list is-fix">
                  <h3>Fix next time</h3>
                  <ul>{feedback.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </section>
              )}
            </div>

            {feedback.unused_strengths.length > 0 && (
              <section className="vi-panel">
                <h3>Strong examples from your library that never came up</h3>
                <div className="vi-chips">{feedback.unused_strengths.map((s, i) => <span key={i} className="vi-chip">{s}</span>)}</div>
              </section>
            )}

            <section className="vi-questions">
              <h3>Question by question</h3>
              {feedback.questions.map((q, i) => {
                const parts = (['situation', 'task', 'action', 'result'] as const)
                return (
                  <details key={i} className="vi-q" open={i === 0}>
                    <summary>
                      <span className="vi-q-text">{q.question}</span>
                      <span className="vi-star" aria-label={`Covered: ${parts.filter((k) => q.star[k]).join(', ') || 'none'}`}>
                        {parts.map((k) => <span key={k} className={q.star[k] ? 'on' : ''} title={k[0].toUpperCase() + k.slice(1)} />)}
                      </span>
                      <span className={`vi-q-score is-${q.score >= 4 ? 'good' : q.score >= 3 ? 'ok' : 'low'}`}>{q.score}/5</span>
                    </summary>
                    <div className="vi-q-body">
                      <p>{q.answer_summary}</p>
                      <p className="vi-tip">{q.better_answer_tip}</p>
                      {q.modules_used.length > 0 && <p className="vi-muted">You drew on: {q.modules_used.join(', ')}</p>}
                      {q.missed_module && <p className="vi-note is-amber">Better example in your library: {q.missed_module}</p>}
                      {q.unsupported_claims.length > 0 && (
                        <p className="vi-note is-rose">
                          Not in your library: {q.unsupported_claims.join('; ')}. Add it to a module or stop saying it. <Link href="/library">Open library</Link>
                        </p>
                      )}
                    </div>
                  </details>
                )
              })}
              <p className="vi-fine">The four marks next to each question show which parts of a complete answer you covered: situation, task, action and result.</p>
            </section>
          </>
        )}

        {viewTranscript && viewTranscript.length > 0 && (
          <details className="vi-panel vi-transcript">
            <summary>Transcript</summary>
            <div className="vi-captions-list">
              {viewTranscript.map((t, i) => (
                <div key={i} className={`vi-turn is-${t.role}`}>
                  <span className="vi-turn-who">{t.role === 'agent' ? 'Interviewer' : 'You'}</span>
                  <span>{t.message}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    )
  }

  // ─── Setup ───────────────────────────────────────────────────────────────
  const canStart = status.enabled && status.is_pro && left > 0 && !!jdId && consent
  return (
    <div className="vi vi-setup">
      <div className="vi-setup-main">
        {!status.is_pro && (
          <div className="vi-panel vi-callout vi-callout-sprint">
            <span>Voice mock interviews are part of a Sprint. Your library, resumes and jobs stay free.</span>
            <SprintButton returnUrl="/interview-prep/voice" />
          </div>
        )}
        {!status.enabled && status.is_pro && (
          <div className="vi-panel vi-callout">Voice interviews are paused right now. Check back soon.</div>
        )}

        <h2 className="vi-h">Practice the interview out loud</h2>
        <p className="vi-lede">An AI interviewer asks the questions this job is likely to ask, using what&apos;s in your library. When you hang up, you get a scored report.</p>

        <label className="vi-field">
          <span className="vi-legend">Job</span>
          {jobs.length === 0 ? (
            <span className="vi-muted">Save a job first. <Link href="/interview-prep">Add one in Interview Prep</Link></span>
          ) : (
            <select className="form-input" value={jdId} onChange={(e) => setJdId(e.target.value)}>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
            </select>
          )}
        </label>

        <fieldset className="vi-field">
          <legend className="vi-legend">Who&apos;s interviewing you</legend>
          <div className="vi-types" role="radiogroup">
            {TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={type === t.key}
                className={`vi-type${type === t.key ? ' is-on' : ''}`}
                onClick={() => setType(t.key)}
              >
                <span className="vi-type-name">{t.label}</span>
                <span className="vi-type-q">&ldquo;{t.sample}&rdquo;</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="vi-field">
          <legend className="vi-legend">Length</legend>
          <div className="vi-seg" role="radiogroup">
            {([10, 20] as const).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={length === n} className={length === n ? 'is-on' : ''} onClick={() => setLength(n)}>
                {n} minutes
              </button>
            ))}
          </div>
        </fieldset>

        <label className="vi-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            I understand I&apos;m talking to an AI interviewer, not a person. I agree that my voice is recorded and processed by
            ElevenLabs to run the conversation, and that ModuleHire saves the transcript and feedback to my account. ModuleHire
            does not store audio. I can delete any session at any time. <Link href="/privacy#voice">Privacy</Link>
          </span>
        </label>

        {error && <p className="vi-error" role="alert">{error}</p>}
      </div>

      <aside className="vi-setup-side">
        <div className="vi-preview">
          <div className="vi-orb is-idle"><span className="vi-orb-core" /></div>
          <div className="vi-preview-job">{job?.label ?? 'Pick a job'}</div>
          <div className="vi-muted">{typeInfo.label}, {length} minutes</div>
          <p className="vi-preview-q">&ldquo;{typeInfo.sample}&rdquo;</p>
          <button className="vi-btn vi-btn-primary vi-start" onClick={start} disabled={!canStart}>Start interview</button>
          <div className="vi-muted vi-left">
            {status.is_pro ? `${left} of ${status.monthly_limit} interviews left this month` : 'Part of a Sprint'}
          </div>
          {!consent && status.is_pro && <div className="vi-fine">Tick the consent box to start.</div>}
          <div className="vi-fine">Headphones help the interviewer hear you clearly.</div>
        </div>

        {history.length > 0 && (
          <div className="vi-history">
            <h3>Past interviews for this job</h3>
            {history.map((s) => (
              <div key={s.id} className="vi-history-row">
                <button type="button" onClick={() => openSession(s.id)}>
                  <span>{TYPE_LABEL[s.interview_type] ?? s.interview_type}</span>
                  <span className="vi-muted">
                    {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {s.duration_s ? `, ${Math.max(1, Math.round(s.duration_s / 60))} min` : ''}
                  </span>
                </button>
                <span className={`vi-history-score${s.overall_score != null ? ` is-${scoreTone(s.overall_score)}` : ''}`}>{s.overall_score ?? '–'}</span>
                <button type="button" className="vi-history-del" onClick={() => remove(s.id)} aria-label="Delete this interview">Delete</button>
              </div>
            ))}
          </div>
        )}

        <div className="vi-grant">
          <span className="vi-fine">Voice interviews are supported by</span>
          <GrantBadge width={170} />
        </div>
      </aside>
    </div>
  )
}
