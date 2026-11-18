'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { TodayStep } from '@/lib/today'

// The user's local date, so "done for today" follows their day, not the server's.
function localDay(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function whenLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (days <= 0) return `Today at ${time}`
  if (days === 1) return `Tomorrow at ${time}`
  return `${d.toLocaleDateString(undefined, { weekday: 'long' })} at ${time}`
}

export default function TodaySteps() {
  const [steps, setSteps] = useState<TodayStep[] | null>(null)
  const [doneToday, setDoneToday] = useState(0)
  const [checking, setChecking] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    fetch(`/api/home/today?day=${localDay()}`)
      .then(r => r.json())
      .then(d => { if (alive) { setSteps(d.steps ?? []); setDoneToday(d.done_today ?? 0) } })
      .catch(() => { if (alive) setSteps([]) })
    return () => { alive = false }
  }, [reload])

  async function check(step: TodayStep) {
    setChecking(step.key)
    try {
      await fetch('/api/home/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_key: step.key, day: localDay() }),
      })
      setReload(n => n + 1)
    } finally {
      setChecking(null)
    }
  }

  if (steps === null) {
    return <ol className="home-steps" aria-busy="true">{[0, 1, 2].map(i => <li key={i} className="home-step home-step-skeleton" />)}</ol>
  }
  if (steps.length === 0) {
    return (
      <div className="home-steps-empty">
        {doneToday > 0 ? `You've done ${doneToday} thing${doneToday === 1 ? '' : 's'} today. Nothing else is waiting.` : 'Nothing is waiting on you right now.'}
      </div>
    )
  }

  return (
    <ol className="home-steps">
      {steps.map((s, i) => (
        <li key={s.key} className="home-step">
          <button
            type="button"
            className="home-check"
            aria-label={`Mark "${s.title}" done for today`}
            title="Done for today"
            disabled={checking === s.key}
            onClick={() => check(s)}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <Link href={s.href} className="home-step-link">
            <span className="home-step-num">{i + 1}</span>
            <span className="home-step-body">
              <span className="home-step-title">{s.title}</span>
              {(s.when || s.detail) && <span className="home-step-detail">{s.when ? whenLabel(s.when) : s.detail}</span>}
            </span>
            <span className="home-step-arrow" aria-hidden="true">→</span>
          </Link>
        </li>
      ))}
    </ol>
  )
}
