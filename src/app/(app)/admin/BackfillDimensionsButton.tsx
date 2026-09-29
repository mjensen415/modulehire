'use client'

import { useState } from 'react'

export function BackfillDimensionsButton() {
  const [running, setRunning] = useState(false)
  const [totalTagged, setTotalTagged] = useState(0)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function run() {
    setRunning(true)
    setError('')
    setTotalTagged(0)
    setRemaining(null)
    try {
      let stillRemaining = 1
      while (stillRemaining > 0) {
        const res = await fetch('/api/admin/backfill-dimensions', { method: 'POST' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Backfill failed')
        setTotalTagged(prev => prev + (data.tagged ?? 0))
        setRemaining(data.remaining ?? 0)
        stillRemaining = data.remaining ?? 0
        // If a run made zero progress, stop rather than looping forever.
        if ((data.tagged ?? 0) === 0 && stillRemaining > 0) {
          throw new Error(`Stopped — ${stillRemaining} modules left but the last run tagged none.`)
        }
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button className="btn-ghost" style={{ fontSize: 12 }} onClick={run} disabled={running}>
        {running ? 'Backfilling…' : 'Backfill dimensions'}
      </button>
      {(totalTagged > 0 || remaining !== null) && (
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>
          Tagged {totalTagged}{remaining !== null ? ` · ${remaining} left` : ''}
        </span>
      )}
      {error && <span style={{ fontSize: 12, color: 'var(--rose)' }}>{error}</span>}
    </div>
  )
}
