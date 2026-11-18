'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function BuildPrepButton({ jdId }: { jdId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function build() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/interview-prep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_description_id: jdId }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error)
      router.refresh()
    } catch (e) {
      setError((e as Error).message || 'Could not build prep.')
      setBusy(false)
    }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
      <p className="warm-sub">Talking points for each requirement in the posting, drawn from your confirmed modules.</p>
      <button type="button" className="warm-btn" disabled={busy} onClick={build}>{busy ? 'Building…' : 'Build my talking points'}</button>
      {error && <div className="warm-error">{error}</div>}
    </div>
  )
}
