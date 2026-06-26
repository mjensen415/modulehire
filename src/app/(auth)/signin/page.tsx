'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Only allow relative paths starting with a single "/" — blocks open redirects
// like "//evil.com" or "https://evil.com".
function safeNext(raw: string | null, fallback = '/dashboard'): string {
  if (!raw) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback
  return raw
}

export default function SignIn() {
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin')

  // Sign in
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Sign up — open signup (no beta code)
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')

  // Forgot password
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)

  const router = useRouter()
  const supabase = createClient()
  const [signinNext, setSigninNext] = useState<string>('/dashboard')
  const [signupNext, setSignupNext] = useState<string>('/onboarding')

  // Read ?next= once on the client. Sign-up always defaults to /onboarding so
  // new accounts always hit the activation flow.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const raw = new URLSearchParams(window.location.search).get('next')
      setSigninNext(safeNext(raw, '/dashboard'))
      setSignupNext(safeNext(raw, '/onboarding'))
      // If the URL says ?signup=1, jump straight to the signup tab.
      if (new URLSearchParams(window.location.search).get('signup') === '1') {
        setActiveTab('signup')
      }
    }
  }, [])

  const handleSignIn = async () => {
    setError('')
    if (!email || !email.includes('@')) return setError('Please enter a valid email address.')
    if (!password || password.length < 6) return setError('Password must be at least 6 characters.')
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else router.push(signinNext)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async () => {
    setError('')
    if (!signupEmail || !signupEmail.includes('@')) return setError('Please enter a valid email address.')
    if (!signupPassword || signupPassword.length < 8) return setError('Password must be at least 8 characters.')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: signupEmail, password: signupPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: signupEmail,
        password: signupPassword,
      })
      if (signInErr) throw signInErr
      router.push(signupNext)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const openForgot = () => {
    setForgotOpen(true)
    setForgotSent(false)
    setForgotEmail(email)
    setError('')
  }

  const closeForgot = () => {
    setForgotOpen(false)
    setForgotSent(false)
    setError('')
  }

  const handleForgot = async () => {
    setError('')
    if (!forgotEmail || !forgotEmail.includes('@')) return setError('Please enter a valid email address.')
    setForgotLoading(true)
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      })
    } catch {
      // Swallow — we always show the same neutral confirmation either way.
    } finally {
      setForgotLoading(false)
      setForgotSent(true)
    }
  }

  // Always send OAuth back to the bare callback. Onboarding-vs-dashboard routing
  // is decided server-side in /auth/callback based on onboarding_complete — passing
  // a ?next= query string here breaks Supabase's redirect-URL allowlist match and
  // bounces the user to the Site URL (landing page) without a session.
  const oauthRedirectTo = () => `${window.location.origin}/auth/callback`

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: oauthRedirectTo() },
    })
  }

  const handleLinkedIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'linkedin_oidc',
      options: { redirectTo: oauthRedirectTo() },
    })
  }

  return (
    <>
      <nav>
        <Link href="/" className="nav-logo">
          <div className="nav-logo-mark">MH</div>
          ModuleHire Labs
        </Link>
      </nav>

      <section className="auth-page">
        <div className="auth-bg" />
        <div className="auth-card">
          <div className="card-logo">
            <div className="card-logo-mark">MH</div>
          </div>

          {!forgotOpen && (
            <div className="auth-tabs">
              <button
                className={`auth-tab ${activeTab === 'signin' ? 'active' : ''}`}
                onClick={() => { setActiveTab('signin'); setError('') }}
              >
                Sign in
              </button>
              <button
                className={`auth-tab ${activeTab === 'signup' ? 'active' : ''}`}
                onClick={() => { setActiveTab('signup'); setError('') }}
              >
                Create account
              </button>
            </div>
          )}

          {/* ─── FORGOT PASSWORD ─── */}
          {forgotOpen && (
            <div className="auth-form-state">
              <h1 className="auth-headline">Reset your password</h1>
              <p className="auth-sub">Enter your email and we&apos;ll send you a reset link.</p>

              {forgotSent ? (
                <>
                  <p style={{ fontSize: 13.5, color: 'var(--text2)', textAlign: 'center', marginBottom: 22, lineHeight: 1.6 }}>
                    If an account exists for <strong>{forgotEmail}</strong>, you&apos;ll receive an email with a link to reset your password shortly.
                  </p>
                  <button className="btn-primary-full" onClick={closeForgot}>
                    Back to sign in
                  </button>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="forgotEmail">Email address</label>
                    <input
                      type="email" id="forgotEmail" className="form-input"
                      placeholder="you@example.com" value={forgotEmail}
                      onChange={e => { setForgotEmail(e.target.value); setError('') }}
                      onKeyDown={e => e.key === 'Enter' && handleForgot()}
                    />
                  </div>

                  {error && <p style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 12 }}>{error}</p>}

                  <button className="btn-primary-full" onClick={handleForgot} disabled={forgotLoading}>
                    {forgotLoading ? 'Sending…' : 'Send reset link'}
                  </button>
                  <button
                    type="button" onClick={closeForgot}
                    style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', color: 'var(--text3)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}
                  >
                    ← Back to sign in
                  </button>
                </>
              )}
            </div>
          )}

          {/* ─── SIGN IN ─── */}
          {!forgotOpen && activeTab === 'signin' && (
            <div className="auth-form-state">
              <h1 className="auth-headline">Welcome back</h1>
              <p className="auth-sub">Sign in to your library</p>

              <div className="form-group">
                <label className="form-label" htmlFor="emailInput">Email address</label>
                <input
                  type="email" id="emailInput" className="form-input"
                  placeholder="you@example.com" value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSignIn()}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="passwordInput">Password</label>
                <input
                  type="password" id="passwordInput" className="form-input"
                  placeholder="••••••••" value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSignIn()}
                />
              </div>

              <div style={{ textAlign: 'right', marginTop: -6, marginBottom: 14 }}>
                <button
                  type="button" onClick={openForgot}
                  style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12.5, cursor: 'pointer', padding: 0, fontFamily: 'var(--font)' }}
                >
                  Forgot password?
                </button>
              </div>

              {error && <p style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 12 }}>{error}</p>}

              <button className="btn-primary-full" onClick={handleSignIn} disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>

              <div className="auth-divider">
                <div className="auth-divider-line" /><span className="auth-divider-text">or</span><div className="auth-divider-line" />
              </div>

              <button className="social-btn" type="button" onClick={handleGoogle}>
                <svg className="social-icon" viewBox="0 0 18 18" fill="none">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                  <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
              <button className="social-btn" type="button" onClick={handleLinkedIn}>
                <svg className="social-icon" viewBox="0 0 18 18" fill="none">
                  <rect width="18" height="18" rx="3" fill="#0A66C2"/>
                  <path d="M5.5 7.5h-2v6h2v-6zM4.5 6.5A1.25 1.25 0 104.5 4a1.25 1.25 0 000 2.5zM13.5 13.5h-2v-3c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v3h-2v-6h2v.79A2.98 2.98 0 0110.5 7c1.65 0 3 1.35 3 3v3.5z" fill="white"/>
                </svg>
                Continue with LinkedIn
              </button>

              <p className="auth-legal">
                By continuing, you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
              </p>
            </div>
          )}

          {/* ─── SIGN UP — open signup, no invite code ─── */}
          {!forgotOpen && activeTab === 'signup' && (
            <div className="auth-form-state">
              <h1 className="auth-headline">Start free</h1>
              <p className="auth-sub">No credit card. Build your library in minutes.</p>

              <div className="form-group">
                <label className="form-label" htmlFor="signupEmail">Email address</label>
                <input
                  type="email" id="signupEmail" className="form-input"
                  placeholder="you@example.com" value={signupEmail}
                  onChange={e => { setSignupEmail(e.target.value); setError('') }}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="signupPassword">Password</label>
                <input
                  type="password" id="signupPassword" className="form-input"
                  placeholder="At least 8 characters" value={signupPassword}
                  onChange={e => { setSignupPassword(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSignUp()}
                />
              </div>

              {error && <p style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 12 }}>{error}</p>}

              <button className="btn-primary-full" onClick={handleSignUp} disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>

              <div className="auth-divider">
                <div className="auth-divider-line" /><span className="auth-divider-text">or sign up with</span><div className="auth-divider-line" />
              </div>

              <button className="social-btn" type="button" onClick={handleGoogle}>
                <svg className="social-icon" viewBox="0 0 18 18" fill="none">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                  <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
              <button className="social-btn" type="button" onClick={handleLinkedIn}>
                <svg className="social-icon" viewBox="0 0 18 18" fill="none">
                  <rect width="18" height="18" rx="3" fill="#0A66C2"/>
                  <path d="M5.5 7.5h-2v6h2v-6zM4.5 6.5A1.25 1.25 0 104.5 4a1.25 1.25 0 000 2.5zM13.5 13.5h-2v-3c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v3h-2v-6h2v.79A2.98 2.98 0 0110.5 7c1.65 0 3 1.35 3 3v3.5z" fill="white"/>
                </svg>
                Continue with LinkedIn
              </button>

              <p className="auth-legal" style={{ marginTop: 16 }}>
                By continuing, you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
