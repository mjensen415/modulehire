'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { PracticeFeedback, PracticeQuestion } from '@/lib/interviews'

export type PastAnswer = { id: string; question: string; answer: string; feedback: PracticeFeedback | null; created_at: string }

const SCORE_LABELS: Array<[keyof PracticeFeedback['scores'], string]> = [
  ['structure', 'Structure'], ['specificity', 'Specificity'], ['relevance', 'Relevance'], ['length', 'Length'],
]

// Practice: pick a question, type an answer, get graded. "Try again" answers once more and
// shows the new scores against the previous attempt.
export default function PracticeRound({ interviewId, initialQuestions, initialAnswers }: {
  interviewId: string
  initialQuestions: PracticeQuestion[]
  initialAnswers: PastAnswer[]
}) {
  const [questions, setQuestions] = useState<PracticeQuestion[]>(initialQuestions)
  const [answers, setAnswers] = useState<PastAnswer[]>(initialAnswers)
  const [loadingQs, setLoadingQs] = useState(initialQuestions.length === 0)
  const [current, setCurrent] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [grading, setGrading] = useState(false)
  const [error, setError] = useState<{ message: string; code?: string } | null>(null)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    if (initialQuestions.length > 0) return
    let alive = true
    fetch(`/api/interviews/${interviewId}/questions`, { method: 'POST' })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d })
      .then(d => { if (alive) setQuestions(d.questions ?? []) })
      .catch(e => { if (alive) setError({ message: (e as Error).message || 'Could not load questions.' }) })
      .finally(() => { if (alive) setLoadingQs(false) })
    return () => { alive = false }
  }, [interviewId, initialQuestions.length])

  const attempts = useMemo(() => answers.filter(a => a.question === current), [answers, current])
  const latest = attempts[attempts.length - 1] ?? null
  const previous = attempts.length > 1 ? attempts[attempts.length - 2] : null
  const answeredSet = useMemo(() => new Set(answers.map(a => a.question)), [answers])
  const showForm = !latest || retrying

  async function grade() {
    if (!current) return
    setGrading(true); setError(null)
    try {
      const res = await fetch(`/api/interviews/${interviewId}/practice`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: current, answer: text }),
      })
      const data = await res.json()
      if (!res.ok) throw Object.assign(new Error(data.error), { code: data.code })
      setAnswers(a => [...a, { id: data.id, question: data.question, answer: data.answer, feedback: data.feedback, created_at: data.created_at }])
      setText('')
      setRetrying(false)
    } catch (e) {
      setError({ message: (e as Error).message || 'Could not grade that.', code: (e as Error & { code?: string }).code })
    } finally {
      setGrading(false)
    }
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <section className="warm-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 className="warm-h2" style={{ marginBottom: 4 }}>Practice</h2>
        <p className="warm-sub">Pick a question and answer it the way you&apos;d say it out loud. You&apos;ll get scores, one fix, and a tighter version that uses only your own facts.</p>
      </div>

      {loadingQs ? (
        <div className="warm-muted">Writing questions for this round…</div>
      ) : (
        <ul className="ivp-qs">
          {questions.map(q => (
            <li key={q.question}>
              <button
                type="button"
                className="ivp-q"
                aria-pressed={current === q.question}
                onClick={() => { setCurrent(q.question); setRetrying(false); setError(null); setText('') }}
              >
                <span className="ivp-q-text">{q.question}</span>
                {q.why && <span className="ivp-q-why">{q.why}</span>}
                {answeredSet.has(q.question) && <span className="ivp-q-done">Practiced</span>}
              </button>

              {current === q.question && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {latest?.feedback && <FeedbackCard fb={latest.feedback} prev={previous?.feedback ?? null} answer={latest.answer} />}

                  {showForm ? (
                    <>
                      <textarea
                        className="warm-input"
                        rows={7}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="Type your answer. Aim for what you'd say in 1 to 2 minutes."
                        aria-label="Your answer"
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <button type="button" className="warm-btn" disabled={grading || words < 15} onClick={grade}>{grading ? 'Grading…' : 'Grade my answer'}</button>
                        {latest && <button type="button" className="warm-btn warm-btn-ghost" onClick={() => setRetrying(false)}>Cancel</button>}
                        <span className="warm-muted" style={{ fontSize: 12.5 }}>{words} words</span>
                      </div>
                    </>
                  ) : (
                    <button type="button" className="warm-btn warm-btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { setRetrying(true); setText('') }}>Try again</button>
                  )}
                  {error && (
                    <div className="warm-error">
                      {error.message}{' '}
                      {error.code === 'PRACTICE_LIMIT_REACHED' && <Link href="/pricing" className="warm-link">Start a 30-day Sprint</Link>}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function FeedbackCard({ fb, prev, answer }: { fb: PracticeFeedback; prev: PracticeFeedback | null; answer: string }) {
  return (
    <div className="ivp-feedback">
      <div className="ivp-scores">
        {SCORE_LABELS.map(([k, label]) => {
          const d = prev ? fb.scores[k] - prev.scores[k] : 0
          return (
            <div key={k} className="ivp-score">
              <div className="ivp-score-num">
                {fb.scores[k]}<span style={{ fontSize: 14 }}>/5</span>
                {prev && d !== 0 && <span className={`ivp-delta ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? `+${d}` : d}</span>}
              </div>
              <div className="ivp-score-label">{label}</div>
            </div>
          )
        })}
      </div>
      {prev && <div className="warm-muted" style={{ fontSize: 12.5 }}>Compared with your previous attempt.</div>}
      <details>
        <summary className="warm-muted" style={{ fontSize: 13, cursor: 'pointer' }}>Your answer</summary>
        <p className="ivp-tighter" style={{ marginTop: 6 }}>{answer}</p>
      </details>
      <div><div className="ivp-fb-label">Strongest part</div><div style={{ fontSize: 14 }}>{fb.strongest_part}</div></div>
      <div><div className="ivp-fb-label">One fix</div><div style={{ fontSize: 14 }}>{fb.one_fix}</div></div>
      {fb.suggested_story && (
        <div>
          <div className="ivp-fb-label">A story to use</div>
          <div style={{ fontSize: 14 }}>
            <Link href={`/library/${fb.suggested_story.module_id}`} className="warm-link">{fb.suggested_story.title}</Link>
            {fb.suggested_story.why ? `: ${fb.suggested_story.why}` : ''}
          </div>
        </div>
      )}
      {fb.tighter_version && (
        <div>
          <div className="ivp-fb-label">Tighter version</div>
          <p className="ivp-tighter" style={{ margin: 0 }}>{fb.tighter_version}</p>
          {fb.removed?.length ? <div className="warm-muted" style={{ fontSize: 12, marginTop: 6 }}>We left out a line that named something not in your answer or library.</div> : null}
        </div>
      )}
    </div>
  )
}
