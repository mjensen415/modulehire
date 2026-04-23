'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignIn() {
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async () => {
    setError('')
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    try {
      if (activeTab === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          setError(error.message)
        } else {
          router.push('/dashboard')
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })
        if (error) {
          setError(error.message)
        } else {
          // If email confirmation is disabled in Supabase, session is active immediately
          router.push('/dashboard')
        }
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  const handleLinkedIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'linkedin_oidc',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
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
        <div className="auth-bg"></div>
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
              <label className="form-label" htmlFor="emailInput">Email address</label>
              <input
                type="email"
                id="emailInput"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="passwordInput">Password</label>
              <input
                type="password"
                id="passwordInput"
                className="form-input"
                placeholder={activeTab === 'signup' ? 'At least 6 characters' : '••••••••'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            {error && (
              <p style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 12 }}>
                {error}
              </p>
            )}

            <button
              className="btn-primary-full"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading
                ? 'Please wait…'
                : activeTab === 'signin' ? 'Sign in' : 'Create account'}
            </button>

            <div className="auth-divider">
              <div className="auth-divider-line"></div>
              <span className="auth-divider-text">or</span>
              <div className="auth-divider-line"></div>
            </div>

            <button className="social-btn" type="button" onClick={handleGoogle}>
              <svg className="social-icon" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <button className="social-btn" type="button" onClick={handleLinkedIn}>
              <svg className="social-icon" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="18" height="18" rx="3" fill="#0A66C2"/>
                <path d="M5.5 7.5h-2v6h2v-6zM4.5 6.5A1.25 1.25 0 104.5 4a1.25 1.25 0 000 2.5zM13.5 13.5h-2v-3c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v3h-2v-6h2v.79A2.98 2.98 0 0110.5 7c1.65 0 3 1.35 3 3v3.5z" fill="white"/>
              </svg>
              Continue with LinkedIn
            </button>

            <p className="auth-legal">
              By continuing, you agree to our <a href="#">Terms</a> and{' '}
              <a href="#">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
