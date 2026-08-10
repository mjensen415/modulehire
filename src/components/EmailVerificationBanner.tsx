'use client'

import { useState } from 'react'

export default function EmailVerificationBanner({ email }: { email: string | null }) {
  // Lazy-init from the URL on the client only — mirrors the ?next=/?signup=
  // pattern in signin/page.tsx so there's no hydration mismatch.
  const [firstVisit] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : new URLSearchParams(window.location.search).get('verify') === '1'
  )
  const [dismissed, setDismissed] = useState(false)
  const [resending, setResending] = useState(false)
  const [sent, setSent] = useState(false)

  if (dismissed) return null

  async function handleResend() {
    setResending(true)
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' })
      if (res.ok) {
        setSent(true)
        setTimeout(() => setSent(false), 3000)
      }
    } finally {
      setResending(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '10px 20px',
        background: '#fef3c7',
        borderBottom: '1px solid #f59e0b',
        color: '#78350f',
        fontSize: 13,
        fontFamily: 'var(--font)',
        flexShrink: 0,
      }}
    >
      <span style={{ flex: 1 }}>
        {firstVisit
          ? `We sent a confirmation to ${email ?? 'your email'} — click the link to unlock resume generation.`
          : 'Please verify your email — check your inbox for a confirmation link.'}
      </span>

      <button
        onClick={handleResend}
        disabled={resending}
        style={{
          background: 'none', border: 'none', color: '#78350f', fontWeight: 700,
          fontSize: 13, cursor: resending ? 'default' : 'pointer', textDecoration: 'underline',
          fontFamily: 'var(--font)', flexShrink: 0, whiteSpace: 'nowrap',
        }}
      >
        {sent ? 'Sent!' : resending ? 'Sending…' : 'Resend →'}
      </button>

      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          background: 'none', border: 'none', color: '#78350f', cursor: 'pointer',
          fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  )
}
