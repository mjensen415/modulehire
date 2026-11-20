'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import IntegrationsCard from './IntegrationsCard'
import './settings.css'

type Org = { id: string; name: string; slug: string; tier: string; role: string; created_at: string }

type PlanInfo = { name: string; tier: string; activeJobs: number | null; monthlyScores: number | null }
type UsageResponse = {
  plan: PlanInfo
  usage: { activeJobs: number; scoresThisMonth: number }
  team: PlanInfo & { price: string }
  has_billing_account: boolean
}

type TabKey = 'organization' | 'team' | 'integrations' | 'billing'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'organization', label: 'Organization' },
  { key: 'team', label: 'Team' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'billing', label: 'Plan and billing' },
]
const TAB_ALIASES: Record<string, TabKey> = { organization: 'organization', team: 'team', integrations: 'integrations', billing: 'billing', plan: 'billing' }

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const full = limit !== null && used >= limit
  return (
    <div>
      <div className={`bs-usage-row${full ? ' full' : ''}`}>
        <span>{label}</span>
        <span>{used}{limit === null ? ' (unlimited)' : ` of ${limit}`}</span>
      </div>
      {limit !== null && (
        <div className={`bs-bar${full ? ' full' : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
          <i style={{ width: `${pct}%` }} />
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
    <div className="biz-card" id="plan">
      <div className="biz-card-head"><h2 className="biz-h2">Plan</h2></div>
      <div className="bs-card">
        {justUpgraded && !isFree && info && <div className="bs-success" role="status">You&apos;re on Team. Thanks!</div>}
        {justUpgraded && isFree && <div className="bs-info" role="status">Payment received. Your plan will update in a few seconds.</div>}
        {!info ? (
          <p className="bs-note" role="status">Loading…</p>
        ) : (
          <>
            <div className="bs-plan-top">
              <div>
                <p className="bs-plan-name">{info.plan.name}</p>
                <p className="bs-note">
                  {isFree
                    ? `Upgrade to Team for ${info.team.price}/month: unlimited active jobs, ${info.team.monthlyScores} scored applicants a month.`
                    : info.plan.tier === 'enterprise'
                      ? 'Custom plan. Contact info@modulehire.com for changes.'
                      : `${info.team.price}/month, billed monthly.`}
                </p>
              </div>
              {isOwner && isFree && (
                <button type="button" className="biz-btn" disabled={busy} onClick={() => go('/api/business/billing/checkout')}>
                  {busy ? 'Opening…' : 'Upgrade to Team'}
                </button>
              )}
              {isOwner && info.plan.tier === 'growth' && info.has_billing_account && (
                <button type="button" className="biz-btn biz-btn-ghost" disabled={busy} onClick={() => go('/api/business/billing/portal')}>
                  {busy ? 'Opening…' : 'Manage billing'}
                </button>
              )}
            </div>
            <UsageBar label="Active job postings" used={info.usage.activeJobs} limit={info.plan.activeJobs} />
            <UsageBar label="Applicants scored this month" used={info.usage.scoresThisMonth} limit={info.plan.monthlyScores} />
            {!isOwner && isFree && <p className="bs-note">Ask the organization owner to upgrade.</p>}
            {error && <div className="bs-error" role="alert">{error}</div>}
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
  const [tab, setTab] = useState<TabKey>('organization')
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({ organization: null, team: null, integrations: null, billing: null })

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

  // ?tab=integrations (or the older #integrations / #plan links); a Stripe return opens billing.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const wanted = params.get('tab') ?? window.location.hash.replace('#', '')
    const next = params.get('upgraded') === '1' ? 'billing' : TAB_ALIASES[wanted]
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-mount URL read
    if (next) setTab(next)
  }, [])

  function selectTab(next: TabKey, focus = false) {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    url.hash = ''
    window.history.replaceState(null, '', url.toString())
    if (focus) tabRefs.current[next]?.focus()
  }

  function onTabKey(e: React.KeyboardEvent) {
    const i = TABS.findIndex((t) => t.key === tab)
    const move = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (move) { e.preventDefault(); selectTab(TABS[(i + move + TABS.length) % TABS.length].key, true) }
    else if (e.key === 'Home') { e.preventDefault(); selectTab(TABS[0].key, true) }
    else if (e.key === 'End') { e.preventDefault(); selectTab(TABS[TABS.length - 1].key, true) }
  }

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
  const isOwner = org?.role === 'owner'

  return (
    <div className="biz-inner bs-inner">
      <header className="bs-head">
        <h1 className="biz-h1">Settings</h1>
        {org && (
          <div className="biz-tabs" role="tablist" aria-label="Settings sections" onKeyDown={onTabKey}>
            {TABS.map((t) => (
              <button
                key={t.key}
                ref={(el) => { tabRefs.current[t.key] = el }}
                type="button"
                role="tab"
                id={`bs-tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls={`bs-panel-${t.key}`}
                tabIndex={tab === t.key ? 0 : -1}
                onClick={() => selectTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {loading ? (
        <p className="bs-note" role="status">Loading…</p>
      ) : !org ? (
        <div className="biz-card biz-empty">
          <h2>No organization found</h2>
          <p>Create an organization to manage its settings.</p>
          <a className="biz-btn" href="/business/onboarding">Create organization</a>
        </div>
      ) : (
        <div className="bs-panel" role="tabpanel" id={`bs-panel-${tab}`} aria-labelledby={`bs-tab-${tab}`} tabIndex={0}>
          {tab === 'organization' && (
            <div className="biz-card">
              <div className="biz-card-head">
                <h2 className="biz-h2">Organization</h2>
                <span className="biz-muted" style={{ fontSize: 13 }}>Created {formatDate(org.created_at)}</span>
              </div>
              <div className="bs-card">
                {error && <div className="bs-error" role="alert">{error}</div>}
                <form onSubmit={handleSaveName}>
                  <label className="bs-field">
                    Organization name
                    <span className="bs-inline">
                      <input
                        className="bs-input"
                        type="text"
                        value={nameInput}
                        onChange={(e) => { setNameInput(e.target.value); setSaved(false) }}
                        maxLength={100}
                        disabled={!isOwner}
                      />
                      {isOwner && (
                        <button type="submit" className="biz-btn" disabled={saving || !isDirty || !nameInput.trim()}>
                          {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
                        </button>
                      )}
                    </span>
                  </label>
                  {!isOwner && <p className="bs-note" style={{ marginTop: 6 }}>Only owners can rename the organization.</p>}
                </form>
                <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="bs-kv"><dt>Slug</dt><dd><span className="bs-mono">{org.slug}</span></dd></div>
                </dl>
              </div>
            </div>
          )}

          {tab === 'team' && (
            <div className="biz-card">
              <div className="biz-card-head"><h2 className="biz-h2">Team</h2></div>
              <div className="bs-card">
                <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="bs-kv"><dt>Your role</dt><dd><span className="biz-chip teal">{org.role}</span></dd></div>
                </dl>
                <p className="bs-note">
                  Owners rename the organization and manage the plan and billing. Owners and admins connect and manage ATS integrations.
                </p>
              </div>
            </div>
          )}

          {tab === 'integrations' && <IntegrationsCard orgId={org.id} />}

          {tab === 'billing' && <PlanCard orgId={org.id} isOwner={isOwner} />}
        </div>
      )}
    </div>
  )
}
