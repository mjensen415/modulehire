'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Conversation, type Mode } from '@elevenlabs/react'
import type { VoiceFeedback } from '@/lib/voice/interview'

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
  { key: 'recruiter_screen', label: 'Recruiter screen', blurb: 'Background, motivation, logistics.' },
  { key: 'behavioral', label: 'Hiring manager', blurb: 'Tell-me-about-a-time questions tied to the role.' },
  { key: 'deep_dive', label: 'Role deep dive', blurb: 'How you would actually do the job.' },
] as const
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.key, t.label]))
const CONSENT_KEY = 'mh-voice-consent'

const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 20 }
const chip = (on: boolean): React.CSSProperties => ({
  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
  border: `1px solid ${on ? 'var(--teal)' : 'var(--border2)'}`, color: on ? 'var(--teal)' : 'var(--text3)',
})

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
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.max(0, s % 60)).padStart(2, '0')}`
}

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

  const convRef = useRef<Awaited<ReturnType<typeof Conversation.startSession>> | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const maxSecondsRef = useRef(600)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const finishingRef = useRef(false)

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
    setFeedbackNote(data.feedback ? '' : data.status === 'failed' ? 'Scoring failed for this session.' : 'No feedback for this session (it was too short to score).')
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
      return setError('Microphone access was blocked. Allow it in your browser and try again.')
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
      return setError(data.error === 'pro_required' ? 'Voice interviews are a Pro feature.' : data.error || 'Could not start.')
    }

    sessionIdRef.current = data.session_id
    conversationIdRef.current = null
    maxSecondsRef.current = data.max_seconds
    setMaxSeconds(data.max_seconds)
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
      setError('Could not connect to the interviewer. Check your connection and try again.')
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

  if (!status) return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>

  const left = Math.max(0, status.monthly_limit - status.used_this_month)
  const history = status.sessions.filter((s) => !jdId || s.job_description_id === jdId)

  // ─── Live ────────────────────────────────────────────────────────────────
  if (phase === 'connecting' || phase === 'live') {
    const remaining = maxSeconds - elapsed
    const lastAgent = [...turns].reverse().find((t) => t.role === 'agent')
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ ...card, textAlign: 'center', padding: 36 }}>
          <div
            style={{
              width: 120, height: 120, borderRadius: '50%', margin: '0 auto 20px',
              background: mode === 'speaking' ? 'var(--teal)' : 'var(--teal-dim)',
              boxShadow: mode === 'speaking' ? '0 0 0 14px var(--teal-dim)' : 'none',
              transition: 'all 0.25s',
            }}
          />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
            {phase === 'connecting' ? 'Connecting…' : mode === 'speaking' ? 'Interviewer is speaking' : muted ? 'You are muted' : 'Listening'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>
            {phase === 'live' ? (remaining >= 0 ? `${fmt(remaining)} left` : 'Wrapping up') : ''}
          </div>
          {lastAgent && (
            <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 20, lineHeight: 1.5 }}>&ldquo;{lastAgent.message}&rdquo;</div>
          )}
          {audioBlocked && phase === 'live' && (
            <button
              className="btn-primary"
              style={{ marginTop: 20 }}
              onClick={() => startInterviewerAudio().then((ok) => setAudioBlocked(!ok))}
            >
              🔊 Can&apos;t hear the interviewer? Turn on audio
            </button>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 24 }}>
            <button className="btn-ghost" onClick={toggleMute} disabled={phase !== 'live'}>{muted ? 'Unmute' : 'Mute'}</button>
            <button className="btn-primary" onClick={end}>End interview</button>
          </div>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text3)', textAlign: 'center', marginTop: 12 }}>
          You are talking to an AI. Audio is processed by ElevenLabs; ModuleHire saves the transcript to your account.
        </p>
      </div>
    )
  }

  if (phase === 'scoring') {
    return (
      <div style={{ ...card, maxWidth: 720, margin: '0 auto', textAlign: 'center', padding: 36 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Reviewing your answers…</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 6 }}>Checking each answer against your library. About a minute.</div>
      </div>
    )
  }

  // ─── Feedback ────────────────────────────────────────────────────────────
  if (phase === 'feedback') {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => { setPhase('setup'); setFeedback(null) }}>← Practice again</button>
          {activeSessionId && <button className="btn-ghost" onClick={() => remove(activeSessionId)}>Delete this session</button>}
        </div>
        {!feedback ? (
          <div style={card}><div style={{ fontSize: 14, color: 'var(--text2)' }}>{feedbackNote || 'No feedback yet.'}</div></div>
        ) : (
          <>
            <div style={{ ...card, display: 'flex', gap: 20, alignItems: 'center' }}>
              <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--teal)', fontFamily: 'var(--mono)' }}>{feedback.overall_score}</div>
              <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.55 }}>{feedback.summary}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <List title="What worked" items={feedback.strengths} />
              <List title="Fix next time" items={feedback.improvements} />
            </div>
            {feedback.unused_strengths.length > 0 && (
              <List title="Strong library modules you never mentioned" items={feedback.unused_strengths} />
            )}
            {feedback.questions.map((q, i) => (
              <div key={i} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{q.question}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', fontFamily: 'var(--mono)', flexShrink: 0 }}>{q.score}/5</div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>{q.answer_summary}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {(['situation', 'task', 'action', 'result'] as const).map((k) => (
                    <span key={k} style={chip(q.star[k])}>{k[0].toUpperCase() + k.slice(1)}</span>
                  ))}
                </div>
                {q.modules_used.length > 0 && (
                  <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 10 }}>Drew on: {q.modules_used.join(', ')}</div>
                )}
                {q.missed_module && (
                  <div style={{ fontSize: 12.5, color: 'var(--amber)', marginTop: 6 }}>Better example in your library: {q.missed_module}</div>
                )}
                {q.unsupported_claims.length > 0 && (
                  <div style={{ fontSize: 12.5, color: 'var(--rose)', marginTop: 6 }}>
                    Not in your library: {q.unsupported_claims.join('; ')}. Add it to a module or stop saying it. <Link href="/library" style={{ color: 'var(--teal)' }}>Library ↗</Link>
                  </div>
                )}
                <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 10 }}>Tip: {q.better_answer_tip}</div>
              </div>
            ))}
          </>
        )}
        {viewTranscript && viewTranscript.length > 0 && (
          <details style={card}>
            <summary style={{ cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Transcript</summary>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {viewTranscript.map((t, i) => (
                <div key={i} style={{ fontSize: 13, color: t.role === 'agent' ? 'var(--text2)' : 'var(--text)' }}>
                  <strong>{t.role === 'agent' ? 'Interviewer' : 'You'}:</strong> {t.message}
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
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!status.is_pro && (
        <div style={{ ...card, borderColor: 'var(--teal)' }}>
          <div style={{ fontSize: 14, color: 'var(--text)' }}>
            Voice mock interviews are part of Pro. <Link href="/pricing" style={{ color: 'var(--teal)', fontWeight: 700 }}>See plans →</Link>
          </div>
        </div>
      )}
      {!status.enabled && status.is_pro && (
        <div style={card}><div style={{ fontSize: 14, color: 'var(--text2)' }}>Voice interviews are paused right now. Check back soon.</div></div>
      )}

      <div style={card}>
        <Label>Job</Label>
        {jobs.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            Save a job first. <Link href="/interview-prep" style={{ color: 'var(--teal)' }}>Add one in Interview Prep →</Link>
          </div>
        ) : (
          <select className="form-input" value={jdId} onChange={(e) => setJdId(e.target.value)}>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
          </select>
        )}

        <Label style={{ marginTop: 18 }}>Interview type</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              style={{
                textAlign: 'left', padding: 14, borderRadius: 10, cursor: 'pointer', background: 'var(--bg2)',
                border: `1.5px solid ${type === t.key ? 'var(--teal)' : 'var(--border)'}`, fontFamily: 'var(--font)',
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{t.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>{t.blurb}</div>
            </button>
          ))}
        </div>

        <Label style={{ marginTop: 18 }}>Length</Label>
        <div style={{ display: 'flex', gap: 8 }}>
          {([10, 20] as const).map((n) => (
            <button key={n} className={length === n ? 'btn-primary' : 'btn-ghost'} onClick={() => setLength(n)}>{n} min</button>
          ))}
        </div>

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 20, fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            I understand I&apos;m talking to an AI interviewer, not a person. I agree that my voice is recorded and processed by
            ElevenLabs to run the conversation, and that ModuleHire saves the transcript and feedback to my account. ModuleHire
            does not store audio. I can delete any session at any time. <Link href="/privacy#voice" style={{ color: 'var(--teal)' }}>Privacy</Link>
          </span>
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18 }}>
          <button className="btn-primary" onClick={start} disabled={!canStart}>Start interview</button>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {status.is_pro ? `${left} of ${status.monthly_limit} left this month` : ''}
          </span>
        </div>
        {error && <div style={{ fontSize: 13, color: 'var(--rose)', marginTop: 12 }}>{error}</div>}
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 16 }}>
          Use headphones for the best experience. Voice interviews are powered by ElevenLabs and supported by the{' '}
          <a href="https://elevenlabs.io/startup-grants" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>ElevenLabs Grants</a> program.
        </div>
      </div>

      {history.length > 0 && (
        <div style={card}>
          <Label>Past interviews{jdId ? ' for this job' : ''}</Label>
          {history.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => openSession(s.id)}
                style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', padding: 0 }}
              >
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{TYPE_LABEL[s.interview_type] ?? s.interview_type}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>
                  {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {s.duration_s ? ` · ${fmt(s.duration_s)}` : ''}
                </span>
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--mono)' }}>{s.overall_score ?? '–'}</span>
              <button className="btn-ghost" style={{ fontSize: 11.5, padding: '4px 10px' }} onClick={() => remove(s.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, ...style }}>{children}</div>
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div style={card}>
      <Label>{title}</Label>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((s, i) => <li key={i} style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.5 }}>{s}</li>)}
      </ul>
    </div>
  )
}
