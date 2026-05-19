'use client'

import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: '-2px' }}>
      <circle cx="7" cy="7" r="5" strokeDasharray="10 22" opacity="0.35" />
      <path d="M7 2a5 5 0 015 5" />
    </svg>
  )
}

export default function PaywallModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  if (!open) return null

  async function startCheckout(key: string, body: Record<string, unknown>) {
    setLoading(prev => ({ ...prev, [key]: true }))
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 401) {
        window.location.href = '/signin?next=/generate'
        return
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not start checkout.')
      if (data.url) window.location.href = data.url
    } catch (e) {
      alert((e as Error).message ?? 'Could not start checkout.')
      setLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  const singleLoading = !!loading.single
  const packLoading = !!loading.pack
  const proLoading = !!loading.pro

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border2)',
          borderRadius: 14,
          maxWidth: 720,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '32px 32px 28px',
          position: 'relative',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'none',
            border: 'none',
            color: 'var(--text3)',
            cursor: 'pointer',
            padding: 6,
            fontSize: 20,
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <div style={{ marginBottom: 22, paddingRight: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            Your resume is ready to download
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6, marginBottom: 0 }}>
            Choose a plan to unlock your download.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {/* Single */}
          <div style={{
            border: '1px solid var(--border2)',
            borderRadius: 10,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            background: 'var(--bg2)',
          }}>
            <div>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text3)' }}>Single Resume</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>$9</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>1 tailored resume · credits never expire</div>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => startCheckout('single', { product: 'single' })}
              disabled={singleLoading}
              style={{ marginTop: 'auto', cursor: singleLoading ? 'default' : 'pointer', opacity: singleLoading ? 0.7 : 1 }}
            >
              {singleLoading ? <><Spinner />Starting…</> : 'Buy for $9'}
            </button>
          </div>

          {/* 5-Pack */}
          <div style={{
            border: '1px solid var(--teal-glow, var(--border2))',
            borderRadius: 10,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            background: 'var(--bg2)',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: -10, left: 16,
              background: 'var(--teal, #14b8a6)', color: '#fff',
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              letterSpacing: '0.04em',
            }}>BEST VALUE</div>
            <div>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text3)' }}>5-Pack</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>$29</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>5 resumes · ~$5.80 each · best value</div>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => startCheckout('pack', { product: 'pack' })}
              disabled={packLoading}
              style={{ marginTop: 'auto', cursor: packLoading ? 'default' : 'pointer', opacity: packLoading ? 0.7 : 1 }}
            >
              {packLoading ? <><Spinner />Starting…</> : 'Buy 5-pack'}
            </button>
          </div>

          {/* Pro */}
          <div style={{
            border: '1px solid var(--border2)',
            borderRadius: 10,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            background: 'var(--bg2)',
          }}>
            <div>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text3)' }}>Pro</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>$19<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text2)' }}>/mo</span></div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Unlimited resumes · unlimited uploads</div>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => startCheckout('pro', { plan: 'pro', interval: 'monthly' })}
              disabled={proLoading}
              style={{ marginTop: 'auto', cursor: proLoading ? 'default' : 'pointer', opacity: proLoading ? 0.7 : 1 }}
            >
              {proLoading ? <><Spinner />Starting…</> : 'Start Pro'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
