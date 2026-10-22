'use client'

import { useEffect, useRef, useState } from 'react'
import type { LiveFit } from '@/lib/live-fit'

// Eases a displayed number toward `target` (count up/down) over ~450ms.
function useAnimatedNumber(target: number): number {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)
  useEffect(() => {
    const from = fromRef.current
    if (from === target) return
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 450)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = Math.round(from + (target - from) * eased)
      setValue(next)
      fromRef.current = next
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target])
  return value
}

type Props = {
  live: LiveFit
  /** 0-100 to show: the live preview anchored to the last server score. */
  score: number
  /** True while the server re-score is running. */
  checking: boolean
  /** When the shown number last matched a server score. */
  serverChecked: boolean
}

export default function FitPanel({ live, score, checking, serverChecked }: Props) {
  const shown = useAnimatedNumber(score)
  const [delta, setDelta] = useState<number | null>(null)
  const lastScore = useRef(score)
  const [popped, setPopped] = useState<Set<string>>(new Set())
  const lastCovered = useRef<Set<string>>(new Set(live.criteria.filter(c => c.covered).map(c => c.label)))

  // "+3" badge when the score moves.
  useEffect(() => {
    const diff = score - lastScore.current
    lastScore.current = score
    if (diff === 0) return
    setDelta(diff)
    const t = setTimeout(() => setDelta(null), 1600)
    return () => clearTimeout(t)
  }, [score])

  // Pop a chip when its requirement becomes covered.
  useEffect(() => {
    const now = new Set(live.criteria.filter(c => c.covered).map(c => c.label))
    const fresh = [...now].filter(l => !lastCovered.current.has(l))
    lastCovered.current = now
    if (fresh.length === 0) return
    setPopped(new Set(fresh))
    const t = setTimeout(() => setPopped(new Set()), 700)
    return () => clearTimeout(t)
  }, [live])

  const covered = live.criteria.filter(c => c.covered).length
  const color = shown >= 70 ? 'var(--teal)' : shown >= 40 ? 'var(--amber, #b7791f)' : 'var(--rose)'

  return (
    <div className="rd-fit" aria-label="Fit for this job">
      <div className="rd-fit-head">
        <div>
          <div className="rd-fit-label">Fit for this job</div>
          <div className="rd-fit-sub">{covered} of {live.criteria.length} requirements on the page</div>
        </div>
        <div className="rd-fit-score" style={{ color }}>
          {shown}
          {delta !== null && (
            <span className={`rd-fit-delta ${delta > 0 ? 'up' : 'down'}`} aria-live="polite">
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
        </div>
      </div>
      <div className="rd-chips">
        {live.criteria.map(c => (
          <span
            key={c.label}
            className={`rd-chip${c.covered ? ' covered' : ''}${popped.has(c.label) ? ' pop' : ''}`}
            title={c.covered ? `On your resume: ${c.matched ?? c.label}` : 'Not on your resume yet'}
          >
            {c.covered ? '✓ ' : ''}{c.label}
          </span>
        ))}
      </div>
      <div className="rd-fit-foot">
        {checking ? 'Checking…' : serverChecked ? 'Checked against the job a moment ago' : 'Live estimate while you type'}
      </div>
    </div>
  )
}
