'use client'

import { useState } from 'react'
import type { SprintSku } from '@/lib/sprint'

// "Start a 30-day Sprint": straight to Stripe Checkout (one payment, no renewal). Used wherever a
// Free limit is hit, on Billing and on the pricing page.
export default function SprintButton({
  sku = 'sprint_30',
  label = 'Start a 30-day Sprint',
  className = 'btn-primary',
  returnUrl,
  style,
}: { sku?: SprintSku; label?: string; className?: string; returnUrl?: string; style?: React.CSSProperties }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, returnUrl: returnUrl ?? window.location.pathname + window.location.search }),
      })
      if (res.status === 401) { window.location.href = `/signin?next=${encodeURIComponent('/pricing')}`; return }
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error)
      window.location.href = data.url
    } catch (e) {
      setError((e as Error).message || 'Could not start checkout. Try again.')
      setBusy(false)
    }
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <button type="button" className={className} style={style} onClick={start} disabled={busy}>
        {busy ? 'Opening checkout…' : label}
      </button>
      {error && <span role="alert" style={{ fontSize: 12.5, color: 'var(--rose, #c4452f)' }}>{error}</span>}
    </span>
  )
}
