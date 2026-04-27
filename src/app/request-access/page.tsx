'use client'

import { useState } from 'react'
import Link from 'next/link'
import PublicNav from '@/components/layout/PublicNav'
import PublicFooter from '@/components/layout/PublicFooter'

export default function RequestAccessPage() {
  const [email, setEmail] = useState('')
  const [context, setContext] = useState('')
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit() {
    setError('')
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/beta-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, context, marketing_opt_in: marketingOptIn }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      setSubmitted(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PublicNav />
      <section className="auth-page">
        <div className="auth-bg" />
        <div className="auth-card">
          <div className="card-logo">
            <div className="card-logo-mark">MH</div>
          </div>

          {submitted ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: 'var(--teal-dim)', border: '1px solid var(--teal-glow)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 11l5 5 9-9" />
                </svg>
              </div>
              <h1 className="auth-headline" style={{ marginBottom: 8 }}>You&rsquo;re on the list</h1>
              <p className="auth-sub" style={{ marginBottom: 24 }}>
                We&rsquo;ll email <strong style={{ color: 'var(--text2)' }}>{email}</strong> when your beta access is ready.
              </p>
              <Link href="/" className="btn-ghost" style={{ textDecoration: 'none', display: 'inline-flex' }}>
                ← Back to home
              </Link>
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: 4 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 11, color: 'var(--teal)', border: '1px solid var(--teal-glow)',
                  background: 'var(--teal-dim)', borderRadius: 20, padding: '3px 11px',
                  fontFamily: 'var(--mono)', letterSpacing: '0.06em',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--teal)', display: 'inline-block' }} />
                  PRIVATE BETA
                </span>
              </div>

              <h1 className="auth-headline" style={{ marginTop: 16 }}>Request beta access</h1>
              <p className="auth-sub">
                We&rsquo;re onboarding a limited set of early users. Drop your email and we&rsquo;ll reach out with an invite code.
              </p>

              <div className="form-group">
                <label className="form-label" htmlFor="emailInput">Email address</label>
                <input
                  type="email"
                  id="emailInput"
                  className="form-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="contextInput">
                  What brings you here?{' '}
                  <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  id="contextInput"
                  className="form-input"
                  placeholder="Job searching, HR tech, just curious…"
                  value={context}
                  onChange={e => setContext(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20 }}>
                <input
                  type="checkbox"
                  id="marketingCheck"
                  checked={marketingOptIn}
                  onChange={e => setMarketingOptIn(e.target.checked)}
                  style={{ marginTop: 3, accentColor: 'var(--teal)', flexShrink: 0 }}
                />
                <label htmlFor="marketingCheck" style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, cursor: 'pointer' }}>
                  Send me product updates, tips, and announcements from ModuleHire Labs
                </label>
              </div>

              {error && (
                <p style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 14 }}>{error}</p>
              )}

              <button
                className="btn-primary-full"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? 'Submitting…' : 'Join the waitlist →'}
              </button>

              <p className="form-helper" style={{ marginTop: 12 }}>
                We&rsquo;ll email you when your access is ready.
              </p>

              <div className="auth-divider" style={{ marginTop: 24 }}>
                <div className="auth-divider-line" />
                <span className="auth-divider-text">already have a code?</span>
                <div className="auth-divider-line" />
              </div>

              <Link
                href="/signin"
                style={{
                  display: 'block', textAlign: 'center', fontSize: 13.5,
                  color: 'var(--teal)', textDecoration: 'none', fontWeight: 600,
                  padding: '10px 0',
                }}
              >
                Sign in with your beta code →
              </Link>
            </>
          )}
        </div>
      </section>
      <PublicFooter />
    </>
  )
}
