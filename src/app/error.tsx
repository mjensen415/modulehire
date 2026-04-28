'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app error]', error)
  }, [error])

  return (
    <section className="page-hero" style={{ minHeight: '100vh' }}>
      <div className="hero-glow"></div>
      <div className="eyebrow">Error</div>
      <h1 className="page-headline">Something went wrong.</h1>
      <p className="page-sub">An unexpected error happened. You can retry or head back home.</p>

      <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/" className="btn-secondary" style={{ textDecoration: 'none' }}>
          Back to home
        </Link>
      </div>

      {error?.digest && (
        <p style={{ marginTop: 18, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
          ref: {error.digest}
        </p>
      )}
    </section>
  )
}
