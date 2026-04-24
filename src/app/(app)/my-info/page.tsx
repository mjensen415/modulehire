'use client'

import { useState, useEffect } from 'react'

type Profile = {
  name: string
  email: string
  phone: string
  linkedin_url: string
  location: string
}

export default function MyInfoPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then((data: Profile) => {
        setProfile(data)
        setName(data.name ?? '')
        setPhone(data.phone ?? '')
        setLinkedin(data.linkedin_url ?? '')
        setLocation(data.location ?? '')
      })
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, linkedin_url: linkedin, location }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setProfile(p => p ? { ...p, ...data } : data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const filled = [name, phone, linkedin, location].filter(Boolean).length
  const total = 4

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">My Info</span>
          <span className="topbar-sub">— Used on every resume you generate</span>
        </div>
      </div>

      <div className="dash-content" style={{ maxWidth: 560, padding: '40px 40px' }}>

        {/* Callout */}
        <div style={{
          background: 'var(--teal-dim)',
          border: '1px solid var(--teal-glow)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 32,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--teal)" strokeWidth="1.6" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 5v3M8 11h.01" />
          </svg>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
            This info is extracted automatically when you upload a resume and pre-filled on every resume you generate. Update it here any time.
          </div>
        </div>

        {/* Completeness bar */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>Profile completeness</span>
            <span style={{ fontSize: 12, color: filled === total ? 'var(--teal)' : 'var(--text3)', fontWeight: 600 }}>
              {filled}/{total} fields
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(filled / total) * 100}%`,
              background: filled === total ? 'var(--teal)' : 'var(--indigo)',
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Name */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, letterSpacing: '0.01em' }}>
                Full name
              </label>
              <input
                className="mod-edit-input"
                style={{ width: '100%' }}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>

            {/* Email — read only */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, letterSpacing: '0.01em' }}>
                Email
              </label>
              <input
                className="mod-edit-input"
                style={{ width: '100%', opacity: 0.5, cursor: 'not-allowed' }}
                value={profile?.email ?? ''}
                disabled
              />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Set by your login — can't be changed here</div>
            </div>

            {/* Phone */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, letterSpacing: '0.01em' }}>
                Phone
              </label>
              <input
                className="mod-edit-input"
                style={{ width: '100%' }}
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+1 415 555 0101"
              />
            </div>

            {/* LinkedIn */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, letterSpacing: '0.01em' }}>
                LinkedIn URL
              </label>
              <input
                className="mod-edit-input"
                style={{ width: '100%' }}
                type="url"
                value={linkedin}
                onChange={e => setLinkedin(e.target.value)}
                placeholder="linkedin.com/in/janedoe"
              />
            </div>

            {/* Location */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, letterSpacing: '0.01em' }}>
                Location
              </label>
              <input
                className="mod-edit-input"
                style={{ width: '100%' }}
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="San Francisco, CA"
              />
            </div>

            {error && (
              <div style={{ fontSize: 13, color: 'var(--rose)' }}>{error}</div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              {saved && (
                <span style={{ fontSize: 13, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <circle cx="6.5" cy="6.5" r="5.5" />
                    <path d="M4 6.5l2 2 3-3" />
                  </svg>
                  Saved
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
