'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ModuleHireLogo from '@/components/ModuleHireLogo'

type Status = 'verifying' | 'ready' | 'invalid' | 'done'

export default function ResetPassword() {
  const supabase = createClient()
  const router = useRouter()

  const [status, setStatus] = useState<Status>('verifying')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Establish the recovery session from the link, then unlock the form.
  useEffect(() => {
    let active = true

    // Hash-based recovery links surface the session via PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        setStatus('ready')
      }
    })

    ;(async () => {
      const url = new URL(window.location.href)

      // Supabase signals a bad/expired link via error_description.
      if (url.searchParams.get('error_description')) {
        if (active) setStatus('invalid')
        return
      }

      // PKCE recovery links arrive with ?code= — exchange it for a session
      // (same pattern as /auth/callback).
      const code = url.searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!active) return
        // Strip the code from the address bar regardless of outcome.
        window.history.replaceState({}, '', '/auth/reset')
        setStatus(error ? 'invalid' : 'ready')
        return
      }

      // Otherwise a session may already exist (cookie, or hash already parsed).
      const { data: { session } } = await supabase.auth.getSession()
      if (active && session) {
        setStatus('ready')
        return
      }

      // Give the hash listener a brief moment before declaring the link invalid.
      setTimeout(async () => {
        if (!active) return
        const { data: { session: late } } = await supabase.auth.getSession()
        setStatus(late ? 'ready' : 'invalid')
      }, 1500)
    })()

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  const handleUpdate = async () => {
    setError('')
    if (!password || password.length < 6) return setError('Password must be at least 6 characters.')
    if (password.length > 200) return setError('Password is too long.')
    if (password !== confirm) return setError('Passwords do not match.')

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) setError(error.message)
      else {
        setStatus('done')
        setTimeout(() => router.push('/dashboard'), 1600)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <nav>
        <Link href="/" className="nav-logo">
          <ModuleHireLogo size="nav" />
        </Link>
      </nav>

      <section className="auth-page">
        <div className="auth-bg" />
        <div className="auth-card">
          <div className="card-logo">
            <ModuleHireLogo size="icon" />
          </div>

          {status === 'verifying' && (
            <div className="auth-form-state">
              <h1 className="auth-headline">Verifying your link…</h1>
              <p className="auth-sub">One moment while we confirm your reset request.</p>
            </div>
          )}

          {status === 'invalid' && (
            <div className="auth-form-state">
              <h1 className="auth-headline">Link expired or invalid</h1>
              <p className="auth-sub">This password reset link is no longer valid. Request a fresh one to try again.</p>
              <Link href="/signin" className="btn-primary-full" style={{ textAlign: 'center', textDecoration: 'none' }}>
                Back to sign in
              </Link>
            </div>
          )}

          {status === 'ready' && (
            <div className="auth-form-state">
              <h1 className="auth-headline">Set a new password</h1>
              <p className="auth-sub">Choose a new password for your account.</p>

              <div className="form-group">
                <label className="form-label" htmlFor="newPassword">New password</label>
                <input
                  type="password" id="newPassword" className="form-input"
                  placeholder="At least 6 characters" value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleUpdate()}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="confirmPassword">Confirm new password</label>
                <input
                  type="password" id="confirmPassword" className="form-input"
                  placeholder="Re-enter your password" value={confirm}
                  onChange={e => { setConfirm(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleUpdate()}
                />
              </div>

              {error && <p style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 12 }}>{error}</p>}

              <button className="btn-primary-full" onClick={handleUpdate} disabled={loading}>
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </div>
          )}

          {status === 'done' && (
            <div className="auth-form-state">
              <h1 className="auth-headline">Password updated</h1>
              <p className="auth-sub">You&apos;re all set — redirecting you to your dashboard…</p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
