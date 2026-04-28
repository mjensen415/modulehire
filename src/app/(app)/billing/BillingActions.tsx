'use client'

import { useState } from 'react'

type Plan = 'free' | 'starter' | 'pro'

interface Props {
  planKey: Plan
  cta: string
  isCurrent: boolean
  isDowngrade: boolean
  hasStripe: boolean
}

export default function BillingActions({ planKey, cta, isCurrent, isDowngrade, hasStripe }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planKey, interval: 'monthly' }),
      })
      const data = await res.json()
      if (res.status === 401) { window.location.href = '/signin?next=/billing'; return }
      if (!res.ok) throw new Error(data.error ?? 'Could not start checkout.')
      if (data.url) window.location.href = data.url
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handlePortal() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not open billing portal.')
      if (data.url) window.location.href = data.url
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (isCurrent) {
    return hasStripe ? (
      <button
        className="btn-ghost"
        style={{ width: '100%' }}
        onClick={handlePortal}
        disabled={loading}
      >
        {loading ? 'Opening…' : 'Manage billing'}
      </button>
    ) : (
      <button className="btn-ghost" disabled style={{ width: '100%' }}>
        Current plan
      </button>
    )
  }

  if (isDowngrade) return null

  return (
    <button
      className="btn-primary"
      style={{ width: '100%' }}
      onClick={handleUpgrade}
      disabled={loading}
    >
      {loading ? 'Redirecting…' : cta}
    </button>
  )
}
