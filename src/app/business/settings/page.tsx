'use client'

import { useCallback, useEffect, useState } from 'react'
import IntegrationsCard from './IntegrationsCard'

type Org = { id: string; name: string; slug: string; tier: string; role: string; created_at: string }

type PlanInfo = { name: string; tier: string; activeJobs: number | null; monthlyScores: number | null }
type UsageResponse = {
  plan: PlanInfo
  usage: { activeJobs: number; scoresThisMonth: number }
  team: PlanInfo & { price: string }
  has_billing_account: boolean
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const full = limit !== null && used >= limit
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
        <span style={{ color: 'var(--text2)' }}>{label}</span>
        <span style={{ color: full ? '#ef4444' : 'var(--text)', fontWeight: 600 }}>
          {used}{limit === null ? '' : ` of ${limit}`}{limit === null ? ' (unlimited)' : ''}
        </span>
      </div>
      {limit !== null && (
        <div style={{ height: 5, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: full ? '#ef4444' : 'var(--teal)' }} />
        </div>
      )}
    </div>
  )
}

function PlanCard({ orgId, isOwner }: { orgId: string; isOwner: boolean }) {
  const [info, setInfo] = useState<UsageResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Read post-mount so server and client render the same first frame.
  const [justUpgraded, setJustUpgraded] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/business/billing/usage?org_id=${orgId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setInfo(d) })
      .catch(() => {})
  }, [orgId])

  useEffect(() => {
    load()
    if (new URLSearchParams(window.location.search).get('upgraded') === '1') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-mount URL read
      setJustUpgraded(true)
      // The webhook usually lands within a few seconds of the redirect.
      const t1 = setTimeout(load, 3000)
      const t2 = setTimeout(load, 8000)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
  }, [load])

  async function go(path: string) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Something went wrong')
      window.location.href = data.url
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const isFree = info?.plan.tier === 'starter'

  return (
    <div className="section-card" id="plan">
      <div className="section-head">
        <div className="section-head-title">Plan</div>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {justUpgraded && !isFree && info && (
          <div style={{ fontSize: 13, color: '#1d9e75', background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.3)', borderRadius: 8, padding: '9px 12px' }}>
            You&apos;re on Team. Thanks!
          </div>
        )}
        {justUpgraded && isFree && (
          <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--bg3)', borderRadius: 8, padding: '9px 12px' }}>
            Payment received. Your plan will update in a few seconds.
          </div>
        )}
        {!info ? (
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                  {info.plan.name}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>
                  {isFree
                    ? `Upgrade to Team for ${info.team.price}/month: unlimited active jobs, ${info.team.monthlyScores} scored applicants a month.`
                    : info.plan.tier === 'enterprise'
                      ? 'Custom plan. Contact info@modulehire.com for changes.'
                      : `${info.team.price}/month, billed monthly.`}
                </div>
              </div>
              {isOwner && isFree && (
                <button className="btn-primary" style={{ flexShrink: 0 }} disabled={busy} onClick={() => go('/api/business/billing/checkout')}>
                  {busy ? 'Opening…' : `Upgrade to Team`}
                </button>
              )}
              {isOwner && info.plan.tier === 'growth' && info.has_billing_account && (
                <button className="btn-ghost" style={{ flexShrink: 0 }} disabled={busy} onClick={() => go('/api/business/billing/portal')}>
                  {busy ? 'Opening…' : 'Manage billing'}
                </button>
              )}
            </div>
            <UsageBar label="Active job postings" used={info.usage.activeJobs} limit={info.plan.activeJobs} />
            <UsageBar label="Applicants scored this month" used={info.usage.scoresThisMonth} limit={info.plan.monthlyScores} />
            {!isOwner && isFree && (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Ask the organization owner to upgrade.</div>
            )}
            {error && <div style={{ fontSize: 12.5, color: '#ef4444' }}>{error}</div>}
          </>
        )}
      </div>
    </div>
  )
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

          <PlanCard orgId={org.id} isOwner={org.role === 'owner'} />

          <IntegrationsCard orgId={org.id} />

        </div>
      )}
    </div>
  )
}
