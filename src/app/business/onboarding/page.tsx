'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function BusinessOnboardingPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [hiringFor, setHiringFor] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/business/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create organization')
      if (hiringFor.trim()) {
        // Optional and best effort: never block onboarding on it.
        await fetch('/api/business/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: hiringFor.trim(), org_id: data.org?.id, context: 'onboarding' }),
        }).catch(() => {})
      }
      router.push('/business/dashboard')
    } catch (e) {
      setError((e as Error).message)
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 16, padding: 40, maxWidth: 480, width: '100%' }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 6, letterSpacing: '-0.02em' }}>
          Create your organization
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 24, lineHeight: 1.5 }}>
          You&apos;ll be the owner and can invite team members later.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="form-label">Organization name</label>
          <input
            className="form-input"
            type="text"
            placeholder="Acme Corp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoFocus
            style={{ marginBottom: 16 }}
          />

          <label className="form-label">
            What are you hiring for, and what would make this worth paying for?{' '}
            <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            className="form-input"
            placeholder="e.g. 3 support roles a quarter, 200+ applicants each. I need it to plug into Greenhouse."
            value={hiringFor}
            onChange={(e) => setHiringFor(e.target.value)}
            maxLength={2000}
            rows={3}
            style={{ marginBottom: 16, resize: 'vertical', fontFamily: 'inherit' }}
          />

          {error && (
            <div style={{ fontSize: 12.5, color: '#ef4444', marginBottom: 16 }}>{error}</div>
          )}

          <button type="submit" className="btn-primary-full" disabled={loading || !name.trim()}>
            {loading ? 'Creating…' : 'Create organization →'}
          </button>
        </form>
      </div>
    </div>
  )
}
