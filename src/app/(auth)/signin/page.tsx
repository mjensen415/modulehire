'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SignIn() {
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [isConfirm, setIsConfirm] = useState(false)
  const supabase = createClient()

  const handleMagicLink = async () => {
    if (!email || !email.includes('@')) {
      const el = document.getElementById('emailInput')
      if (el) {
        el.focus()
        el.style.borderColor = 'var(--rose)'
      }
      return
    }

    try {
      await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      setIsConfirm(true)
    } catch (error) {
      console.error(error)
    }
  }

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  const handleLinkedIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'linkedin_oidc',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <>
      <nav>
        <a href="/" className="nav-logo">
          <div className="nav-logo-mark">MH</div>
          ModuleHire Labs
        </a>
      </nav>

      <section className="auth-page">
        <div className="auth-bg"></div>
        <div className="auth-card">
          <div className="card-logo">
            <div className="card-logo-mark">MH</div>
          </div>

          <div className="auth-tabs">
            <button
              className={`auth-tab ${activeTab === 'signin' ? 'active' : ''}`}
              onClick={() => setActiveTab('signin')}
            >
              Sign in
            </button>
            <button
              className={`auth-tab ${activeTab === 'signup' ? 'active' : ''}`}
              onClick={() => setActiveTab('signup')}
            >
              Create account
            </button>
          </div>

          {!isConfirm ? (
            <div className="auth-form-state">
              <h1 className="auth-headline">
                {activeTab === 'signin' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="auth-sub">
                {activeTab === 'signin'
                  ? 'Sign in to your library'
                  : 'Start building your module library'}
              </p>

              <div className="form-group">
                <label className="form-label" htmlFor="emailInput">
                  Email address
                </label>
                <input
                  type="email"
                  id="emailInput"
                  className="form-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    e.target.style.borderColor = ''
                  }}
                />
              </div>
              <button className="btn-primary-full" onClick={handleMagicLink}>
                {activeTab === 'signin' ? 'Send magic link' : 'Create account'}
              </button>
              <p className="form-helper">
                We'll email you a link — no password needed.
              </p>

              <div className="auth-divider">
                <div className="auth-divider-line"></div>
                <span className="auth-divider-text">or</span>
                <div className="auth-divider-line"></div>
              </div>

              <button className="social-btn" type="button" onClick={handleGoogle}>
                <svg
                  className="social-icon"
                  viewBox="0 0 18 18"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                    fill="#4285F4"
                  />
                  <path
                    d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                    fill="#34A853"
                  />
                  <path
                    d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"
                    fill="#EA4335"
                  />
                </svg>
                Continue with Google
              </button>
              <button className="social-btn" type="button" onClick={handleLinkedIn}>
                <svg
                  className="social-icon"
                  viewBox="0 0 18 18"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect width="18" height="18" rx="3" fill="#0A66C2" />
                  <path
                    d="M5.5 7.5h-2v6h2v-6zM4.5 6.5A1.25 1.25 0 104.5 4a1.25 1.25 0 000 2.5zM13.5 13.5h-2v-3c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v3h-2v-6h2v.79A2.98 2.98 0 0110.5 7c1.65 0 3 1.35 3 3v3.5z"
                    fill="white"
                  />
                </svg>
                Continue with LinkedIn
              </button>

              <p className="auth-legal">
                By continuing, you agree to our <a href="#">Terms</a> and{' '}
                <a href="#">Privacy Policy</a>.
              </p>
            </div>
          ) : (
            <div className="auth-confirm" style={{ display: 'block' }}>
              <div className="confirm-icon flex justify-center">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 48 48"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="24" cy="24" r="20" />
                  <path d="M16 24l6 6 10-12" />
                </svg>
              </div>
              <div className="confirm-title text-center">Check your email</div>
              <p className="confirm-sub text-center">
                We sent a link to <strong>{email}</strong>. It expires in 15 minutes.
              </p>
              <div className="flex justify-center">
                <button
                  className="different-email-link"
                  onClick={() => setIsConfirm(false)}
                >
                  Use a different email
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
