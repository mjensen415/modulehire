'use client'

import { useEffect, useRef, useState } from 'react'
import type { LiveFit } from '@/lib/live-fit'

// Eases a displayed number toward `target` (count up/down) over ~450ms.
export function useAnimatedNumber(target: number): number {
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

export function fitColor(score: number): string {
  return score >= 70 ? 'var(--teal)' : score >= 40 ? 'var(--amber, #b7791f)' : 'var(--rose)'
}

type Props = {
  live: LiveFit
  /** 0-100 to show: the live preview anchored to the last server score. */
  score: number
  checking: boolean
  serverChecked: boolean
  /** The requirement whose lines are highlighted on the page. */
  selected: string | null
  onSelect: (label: string | null) => void
  /** Lines on the page covering each requirement. */
  coverCount: (label: string) => number
  /** Shown under a selected requirement no line covers: a module that could, or "not in your library". */
  renderGap: (label: string) => React.ReactNode
  /** The posting's key phrases found on the page (the old ATS keyword check). */
  keywords: { found: number; total: number }
}

// The Fit rail: one number, "You meet X of Y requirements", and the checklist. Clicking a
// requirement highlights the lines that cover it.
export default function FitPanel({ live, score, checking, serverChecked, selected, onSelect, coverCount, renderGap, keywords }: Props) {
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

  // Pop a row when its requirement becomes covered.
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

  return (
    <div className="rd-rail-body" aria-label="Fit for this job">
      <div className="rd-fit-head">
        <div>
          <div className="rd-fit-label">You meet {covered} of {live.criteria.length} requirements</div>
          <div className="rd-fit-sub">Click one to see the lines that cover it.</div>
        </div>
        <div className="rd-fit-score" style={{ color: fitColor(shown) }}>
          {shown}
          {delta !== null && (
            <span className={`rd-fit-delta ${delta > 0 ? 'up' : 'down'}`} aria-live="polite">
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
        </div>
      </div>

      <ul className="rd-reqs">
        {live.criteria.map(c => {
          const isSelected = selected === c.label
          const lines = c.covered ? coverCount(c.label) : 0
          return (
            <li key={c.label}>
              <button
                type="button"
                className={`rd-req${c.covered ? ' covered' : ''}${isSelected ? ' selected' : ''}${popped.has(c.label) ? ' pop' : ''}`}
                aria-pressed={isSelected}
                onClick={() => onSelect(isSelected ? null : c.label)}
              >
                <span className="rd-req-mark" aria-hidden>{c.covered ? '✓' : ''}</span>
                <span className="rd-req-label">{c.label}</span>
                <span className="rd-req-meta">{c.covered ? (lines > 0 ? `${lines} ${lines === 1 ? 'line' : 'lines'}` : 'on page') : 'missing'}</span>
              </button>
              {isSelected && !c.covered && <div className="rd-req-gap">{renderGap(c.label)}</div>}
            </li>
          )
        })}
      </ul>

      {keywords.total > 0 && (
        <div className="rd-fit-sub" style={{ marginTop: 12 }}>
          {keywords.found} of {keywords.total} of the posting&apos;s key phrases are on the page.
        </div>
      )}
      <div className="rd-fit-foot">
        {checking ? 'Checking against the job…' : serverChecked ? 'Checked against the job a moment ago' : 'Live estimate while you type'}
      </div>
    </div>
  )
}
