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
    <div className="biz-inner" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
      <div className="biz-card" style={{ maxWidth: 520, width: '100%', padding: '36px 36px 32px', boxSizing: 'border-box' }}>
        <h1 className="biz-h1" style={{ marginBottom: 6 }}>Create your organization</h1>
        <p className="biz-sub" style={{ marginBottom: 24 }}>
          You&apos;ll be the owner and can invite team members later.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label className="warm-label">
            Organization name
            <input
              className="warm-input"
              type="text"
              placeholder="Acme Corp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
              style={{ minHeight: 44 }}
            />
          </label>

          <label className="warm-label">
            <span>
              What are you hiring for, and what would make this worth paying for?{' '}
              <span style={{ color: 'var(--h-faint)', fontWeight: 400 }}>(optional)</span>
            </span>
            <textarea
              className="warm-input"
              placeholder="e.g. 3 support roles a quarter, 200+ applicants each. I need it to plug into Greenhouse."
              value={hiringFor}
              onChange={(e) => setHiringFor(e.target.value)}
              maxLength={2000}
              rows={3}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </label>

          {error && (
            <div role="alert" style={{ fontSize: 13, color: 'var(--biz-clay-ink)', background: 'var(--h-peach)', borderRadius: 12, padding: '10px 14px' }}>{error}</div>
          )}

          <button type="submit" className="biz-btn" style={{ width: '100%', minHeight: 44 }} disabled={loading || !name.trim()}>
            {loading ? 'Creating…' : 'Create organization'}
          </button>
        </form>
      </div>
    </div>
  )
}
