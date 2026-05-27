'use client'

import { useState } from 'react'

export type Sku = 'pro_monthly' | 'pro_annual' | 'single' | 'five_pack'

interface Props {
  sku: Sku
  cta: string
  isCurrent?: boolean
  hasStripe?: boolean
  variant?: 'primary' | 'secondary'
}

export default function BillingActions({ sku, cta, isCurrent, hasStripe, variant = 'primary' }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleCheckout() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, returnUrl: '/billing' }),
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
      <button className="btn-ghost" style={{ width: '100%' }} onClick={handlePortal} disabled={loading}>
        {loading ? 'Opening…' : 'Manage billing'}
      </button>
    ) : (
      <button className="btn-ghost" disabled style={{ width: '100%' }}>Current plan</button>
    )
  }

  return (
    <button
      className={variant === 'primary' ? 'btn-primary' : 'btn-secondary'}
      style={{ width: '100%' }}
      onClick={handleCheckout}
      disabled={loading}
    >
      {loading ? 'Redirecting…' : cta}
    </button>
  )
}
