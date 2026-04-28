'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Only allow relative paths starting with a single "/" — blocks open redirects
// like "//evil.com" or "https://evil.com".
function safeNext(raw: string | null): string {
  if (!raw) return '/dashboard'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  return raw
}

type CodeStatus = 'idle' | 'checking' | 'valid' | 'invalid'

export default function SignIn() {
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin')

  // Sign in fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Sign up — beta code gate
  const [codeValue, setCodeValue] = useState('')
  const [codeStatus, setCodeStatus] = useState<CodeStatus>('idle')
  const [codeMessage, setCodeMessage] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()
  const supabase = createClient()
  const [next, setNext] = useState<string>('/dashboard')

  // Read ?next= once on the client (avoids useSearchParams + Suspense churn)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const raw = new URLSearchParams(window.location.search).get('next')
      setNext(safeNext(raw))
    }
  }, [])

  // Debounced code validation
  useEffect(() => {
    const trimmed = codeValue.trim()
    if (!trimmed) {
      setCodeStatus('idle')
      setCodeMessage('')
      return
    }
    if (trimmed.length < 4) return

    setCodeStatus('checking')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/validate-beta-code?code=${encodeURIComponent(trimmed)}`)
        const data = await res.json()
        setCodeStatus(data.valid ? 'valid' : 'invalid')
        setCodeMessage(data.message ?? '')
      } catch {
        setCodeStatus('idle')
      }
    }, 350)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [codeValue])

  const handleSignIn = async () => {
    setError('')
    if (!email || !email.includes('@')) return setError('Please enter a valid email address.')
    if (!password || password.length < 6) return setError('Password must be at least 6 characters.')
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else router.push(next)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async () => {
    setError('')
    if (codeStatus !== 'valid') return setError('Please enter a valid beta code.')
    if (!signupEmail || !signupEmail.includes('@')) return setError('Please enter a valid email address.')
    if (!signupPassword || signupPassword.length < 6) return setError('Password must be at least 6 characters.')
    setLoading(true)
    try {
      // Server creates user + marks code used
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeValue, email: signupEmail, password: signupPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Sign in with the new credentials
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: signupEmail,
        password: signupPassword,
      })
      if (signInErr) throw signInErr
      router.push(next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const oauthRedirectTo = () => {
    const cb = `${window.location.origin}/auth/callback`
    return next === '/dashboard' ? cb : `${cb}?next=${encodeURIComponent(next)}`
  }

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

  const codeBorderColor =
    codeStatus === 'valid' ? 'var(--green)' :
    codeStatus === 'invalid' ? 'var(--rose)' :
    codeStatus === 'checking' ? 'var(--teal-glow)' :
    undefined

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

          {/* ─── SIGN IN ─── */}
          {activeTab === 'signin' && (
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
                By continuing, you agree to our <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.
              </p>
            </div>
          )}

          {/* ─── SIGN UP (beta code gate) ─── */}
          {activeTab === 'signup' && (
            <div className="auth-form-state">
              <h1 className="auth-headline">Create your account</h1>
              <p className="auth-sub">Enter your beta invite code to get started</p>

              {/* Step 1 — beta code */}
              <div className="form-group">
                <label className="form-label" htmlFor="betaCode">
                  Beta invite code
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text" id="betaCode" className="form-input"
                    placeholder="MHLABS-XXXX"
                    value={codeValue}
                    onChange={e => { setCodeValue(e.target.value.toUpperCase()); setError('') }}
                    style={{
                      fontFamily: 'var(--mono)', letterSpacing: '0.06em',
                      paddingRight: 36,
                      borderColor: codeBorderColor,
                      boxShadow: codeStatus === 'valid'
                        ? '0 0 0 3px oklch(0.68 0.18 155 / 0.2)'
                        : codeStatus === 'invalid'
                        ? '0 0 0 3px oklch(0.65 0.18 15 / 0.15)'
                        : undefined,
                    }}
                  />
                  <div style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    display: codeStatus === 'idle' ? 'none' : 'flex',
                  }}>
                    {codeStatus === 'checking' && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--teal)" strokeWidth="2">
                        <circle cx="7" cy="7" r="5" strokeDasharray="8 8" style={{ animationName: 'spin', animationDuration: '0.8s', animationTimingFunction: 'linear', animationIterationCount: 'infinite', transformOrigin: '7px 7px' }} />
                      </svg>
                    )}
                    {codeStatus === 'valid' && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round">
                        <path d="M2 7l4 4 6-6" />
                      </svg>
                    )}
                    {codeStatus === 'invalid' && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--rose)" strokeWidth="2" strokeLinecap="round">
                        <path d="M3 3l8 8M11 3l-8 8" />
                      </svg>
                    )}
                  </div>
                </div>
                {codeMessage && (
                  <p style={{
                    fontSize: 12, marginTop: 5,
                    color: codeStatus === 'valid' ? 'var(--green)' : 'var(--rose)',
                  }}>
                    {codeMessage}
                  </p>
                )}
              </div>

              {/* Step 2 — unlocked when code is valid */}
              {codeStatus === 'valid' && (
                <>
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
                      placeholder="At least 6 characters" value={signupPassword}
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
                </>
              )}

              {codeStatus !== 'valid' && (
                <>
                  {error && <p style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 12 }}>{error}</p>}
                  <p className="form-helper" style={{ marginTop: 8 }}>
                    Don&rsquo;t have a code?{' '}
                    <Link href="/request-access" style={{ color: 'var(--teal)', textDecoration: 'none', fontWeight: 600 }}>
                      Request access →
                    </Link>
                  </p>
                </>
              )}

              <p className="auth-legal" style={{ marginTop: 16 }}>
                By continuing, you agree to our <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
