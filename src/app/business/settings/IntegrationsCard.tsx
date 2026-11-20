'use client'

// Settings → Integrations: connect an ATS with a key the customer creates in their own account.
// Fields, setup steps and permissions per ATS come from src/lib/business/ats/registry.ts.
// None of these need partner status.
import { useEffect, useState } from 'react'
import { PROVIDERS, PROVIDER_INFO, type Provider } from '@/lib/business/ats/registry'

type ProviderStatus = {
  connected: boolean
  hint?: string
  writeback_enabled?: boolean
  status?: 'connected' | 'error'
  last_error?: string | null
  can_comment?: boolean
}
type Status = { can_manage: boolean; integrations: Record<Provider, ProviderStatus> }

const muted = { fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.55 } as const
const check = { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--text2)' } as const

function ConnectForm({ provider, orgId, onDone, onCancel }: { provider: Provider; orgId: string; onDone: () => void; onCancel: () => void }) {
  const info = PROVIDER_INFO[provider]
  const [vals, setVals] = useState<Record<string, string>>({})
  const [writeback, setWriteback] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/business/integrations/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, ...vals, writeback_enabled: writeback }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not connect')
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const complete = info.fields.every((f) => (vals[f.name] ?? '').trim())
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
      <ol style={{ ...muted, margin: 0, paddingLeft: 18 }}>
        {info.steps.map((s) => <li key={s}>{s}</li>)}
        <li>Permissions: {info.permissions.join(', ')}.{info.permissions.length > 1 ? ` ${info.writebackPermission} is only for posting scores back.` : ''}</li>
      </ol>
      {info.fields.map((f) => (
        <div key={f.name}>
          <label className="form-label">{f.label}</label>
          <input
            className="form-input"
            type={f.secret ? 'password' : 'text'}
            value={vals[f.name] ?? ''}
            placeholder={f.placeholder ?? ''}
            onChange={(e) => setVals((v) => ({ ...v, [f.name]: e.target.value }))}
            autoComplete={f.secret ? 'new-password' : 'off'}
            spellCheck={false}
          />
        </div>
      ))}
      <label style={check}>
        <input type="checkbox" checked={writeback} onChange={(e) => setWriteback(e.target.checked)} />
        Post each score back to the candidate in {info.label} as a {info.noteWord}
      </label>
      <div style={muted}>
        We check the key with {info.label} before saving it, store it encrypted, and never show it again.
        {info.hasOptOut && ` Candidates who opted out of AI review in ${info.label} are never imported or scored.`}
      </div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--rose)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || !complete}>
          {busy ? `Checking with ${info.label}…` : `Connect ${info.label}`}
        </button>
      </div>
    </form>
  )
}

export default function IntegrationsCard({ orgId }: { orgId: string }) {
  const [s, setS] = useState<Status | null>(null)
  const [open, setOpen] = useState<Provider | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await fetch(`/api/business/integrations?org_id=${orgId}`)
    if (res.ok) setS(await res.json())
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  async function toggleWriteback(p: Provider, v: boolean) {
    setS((prev) => (prev ? { ...prev, integrations: { ...prev.integrations, [p]: { ...prev.integrations[p], writeback_enabled: v } } } : prev))
    await fetch('/api/business/integrations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org_id: orgId, provider: p, writeback_enabled: v }) })
  }

  async function disconnect(p: Provider) {
    setBusy(true)
    await fetch(`/api/business/integrations?org_id=${orgId}&provider=${p}`, { method: 'DELETE' })
    setBusy(false)
    await load()
  }

  // Connected ones first, so a busy list of options doesn't bury what's set up.
  const order = s ? [...PROVIDERS].sort((a, b) => Number(!!s.integrations[b]?.connected) - Number(!!s.integrations[a]?.connected)) : PROVIDERS

  return (
    <div className="section-card" id="integrations">
      <div className="section-head">
        <div className="section-head-title">Integrations</div>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={muted}>
          Connect your applicant tracking system to pull candidates and resumes into a posting with &quot;Import from your ATS&quot;.
          Using something else? Any ATS can export a spreadsheet, and the import takes that too.
        </div>
        {!s ? <div style={muted}>Loading…</div> : order.map((p, i) => {
          const st = s.integrations[p] ?? { connected: false }
          const info = PROVIDER_INFO[p]
          return (
            <div key={p} style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: i ? 18 : 0, borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 3 }}>{info.label}</div>
                  <div style={muted}>
                    {st.connected
                      ? st.status === 'error'
                        ? <span style={{ color: 'var(--rose)' }}>{st.last_error ?? 'Connection problem. Reconnect.'}</span>
                        : `Connected (${st.hint}).`
                      : info.blurb}
                  </div>
                </div>
                {s.can_manage && open !== p && (
                  st.connected
                    ? <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button className="btn-ghost" disabled={busy} onClick={() => setOpen(p)}>Replace key</button>
                        <button className="btn-ghost" disabled={busy} onClick={() => disconnect(p)}>Disconnect</button>
                      </div>
                    : <button className="btn-ghost" style={{ flexShrink: 0 }} onClick={() => setOpen(p)}>Connect</button>
                )}
              </div>
              {st.connected && s.can_manage && open !== p && (
                <label style={check}>
                  <input type="checkbox" checked={!!st.writeback_enabled} onChange={(e) => toggleWriteback(p, e.target.checked)} />
                  Post each score back to the candidate in {info.label} as a {info.noteWord}
                </label>
              )}
              {p === 'workable' && st.connected && st.can_comment === false && (
                <div style={muted}>We couldn&apos;t find a Workable member to post comments as, so scores won&apos;t be posted back. Reconnect while signed in with the email you use in Workable.</div>
              )}
              {!s.can_manage && !st.connected && <div style={muted}>Ask an owner or admin to connect {info.label}.</div>}
              {open === p && s.can_manage && (
                <ConnectForm provider={p} orgId={orgId} onCancel={() => setOpen(null)} onDone={() => { setOpen(null); load() }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
