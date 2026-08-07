'use client'

import { useEffect, useState } from 'react'

type Org = { id: string; name: string; slug: string; tier: string; role: string; created_at: string }

export default function BusinessSettingsPage() {
  const [org, setOrg] = useState<Org | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/business/organizations')
      .then((r) => r.json())
      .then((data) => setOrg(data.orgs?.[0] ?? null))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 24, letterSpacing: '-0.02em' }}>
        Settings
      </h1>

      {loading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13.5 }}>Loading…</div>
      ) : !org ? (
        <div style={{ color: 'var(--text3)', fontSize: 13.5 }}>No organization found.</div>
      ) : (
        <div className="section-card">
          <div className="section-head">
            <div className="section-head-title">Organization</div>
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div className="form-label" style={{ marginBottom: 4 }}>Name</div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>{org.name}</div>
            </div>
            <div>
              <div className="form-label" style={{ marginBottom: 4 }}>Slug</div>
              <div style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{org.slug}</div>
            </div>
            <div>
              <div className="form-label" style={{ marginBottom: 4 }}>Plan</div>
              <div style={{ fontSize: 13, color: 'var(--text)', textTransform: 'capitalize' }}>{org.tier}</div>
            </div>
            <div>
              <div className="form-label" style={{ marginBottom: 4 }}>Your role</div>
              <div style={{ fontSize: 13, color: 'var(--text)', textTransform: 'capitalize' }}>{org.role}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
