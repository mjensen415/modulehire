'use client'

import { useEffect, useState } from 'react'

type Org = { id: string; name: string; slug: string; tier: string; role: string; created_at: string }

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  beta_pro: 'Beta Pro',
  business: 'Business',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function BusinessSettingsPage() {
  const [org, setOrg] = useState<Org | null>(null)
  const [loading, setLoading] = useState(true)
  const [nameInput, setNameInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/business/organizations')
      .then((r) => r.json())
      .then((data) => {
        const o = data.orgs?.[0] ?? null
        setOrg(o)
        if (o) setNameInput(o.name)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    if (!org || !nameInput.trim() || nameInput.trim() === org.name || saving) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/business/organizations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: org.id, name: nameInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not update organization')
      setOrg((o) => o ? { ...o, name: data.org.name } : o)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const isDirty = nameInput.trim() !== (org?.name ?? '')

  return (
    <div style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 24, letterSpacing: '-0.02em' }}>
        Settings
      </h1>

      {loading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13.5 }}>Loading…</div>
      ) : !org ? (
        <div style={{ color: 'var(--text3)', fontSize: 13.5 }}>No organization found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Organization name */}
          <div className="section-card">
            <div className="section-head">
              <div className="section-head-title">Organization</div>
              <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
                Created {formatDate(org.created_at)}
              </div>
            </div>
            <div style={{ padding: 20 }}>
              {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, padding: '9px 14px', fontSize: 13, color: '#ef4444', marginBottom: 14 }}>
                  {error}
                </div>
              )}
              <form onSubmit={handleSaveName}>
                <label className="form-label">Organization name</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input"
                    type="text"
                    value={nameInput}
                    onChange={(e) => { setNameInput(e.target.value); setSaved(false) }}
                    maxLength={100}
                    style={{ flex: 1 }}
                    disabled={org.role !== 'owner'}
                  />
                  {org.role === 'owner' && (
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={saving || !isDirty || !nameInput.trim()}
                      style={{ flexShrink: 0 }}
                    >
                      {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
                    </button>
                  )}
                </div>
                {org.role !== 'owner' && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
                    Only owners can rename the organization.
                  </div>
                )}
              </form>

              <div style={{ borderTop: '1px solid var(--border)', marginTop: 20, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 500 }}>Slug</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text2)', fontFamily: 'var(--mono)', background: 'var(--bg3)', padding: '3px 8px', borderRadius: 5 }}>
                    {org.slug}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 500 }}>Your role</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 600, textTransform: 'capitalize' }}>{org.role}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Plan */}
          <div className="section-card">
            <div className="section-head">
              <div className="section-head-title">Plan</div>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                    {TIER_LABELS[org.tier] ?? org.tier}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>
                    {org.tier === 'free' ? 'Up to 3 active jobs, 50 applicants per job' : 'Unlimited jobs and applicants'}
                  </div>
                </div>
                {org.tier === 'free' && (
                  <button className="btn-primary" style={{ flexShrink: 0 }} disabled>
                    Upgrade (soon)
                  </button>
                )}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
