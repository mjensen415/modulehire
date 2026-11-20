'use client'

// Settings → Integrations: connect an ATS with a key the customer creates in their own account.
// Greenhouse: Harvest v3 (OAuth) client ID + secret. Workable: subdomain + API access token.
// Neither needs partner status.
import { useEffect, useState } from 'react'

type Provider = 'greenhouse' | 'workable'
type ProviderStatus = {
  connected: boolean
  hint?: string
  writeback_enabled?: boolean
  status?: 'connected' | 'error'
  last_error?: string | null
  can_comment?: boolean
  scopes: string[]
}
type Status = { can_manage: boolean; integrations: Record<Provider, ProviderStatus> }

const LABEL: Record<Provider, string> = { greenhouse: 'Greenhouse', workable: 'Workable' }
const BLURB: Record<Provider, string> = {
  greenhouse: 'Pull candidates and resumes from a Greenhouse job, and post each score back as a note.',
  workable: 'Pull candidates and resumes from a Workable job, and post each score back as a comment.',
}
const muted = { fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.55 } as const
const check = { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--text2)' } as const

function ConnectForm({ provider, orgId, scopes, onDone, onCancel }: { provider: Provider; orgId: string; scopes: string[]; onDone: () => void; onCancel: () => void }) {
  const [a, setA] = useState('') // Greenhouse client ID / Workable subdomain
  const [b, setB] = useState('') // Greenhouse client secret / Workable token
  const [writeback, setWriteback] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const payload = provider === 'greenhouse'
        ? { org_id: orgId, client_id: a, client_secret: b, writeback_enabled: writeback }
        : { org_id: orgId, subdomain: a, token: b, writeback_enabled: writeback }
      const res = await fetch(`/api/business/integrations/${provider}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not connect')
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
      {provider === 'greenhouse' ? (
        <ol style={{ ...muted, margin: 0, paddingLeft: 18 }}>
          <li>In Greenhouse, open Configure (the gear), Dev Center, API Credential Management, then <b>Create new API credentials</b>.</li>
          <li>Choose <b>Harvest V3 (OAuth)</b>, leave Partner blank, and name it ModuleHire.</li>
          <li>Give it these permissions: {scopes.map((x) => x.replace('harvest:', '')).join(', ')}. The last one is only for posting scores back.</li>
          <li>Copy the client ID and client secret here. Greenhouse shows the secret once.</li>
        </ol>
      ) : (
        <ol style={{ ...muted, margin: 0, paddingLeft: 18 }}>
          <li>In Workable, open Settings, Integrations, and find <b>API Access Tokens</b>. Click <b>Generate API token</b>.</li>
          <li>Name it ModuleHire and give it these scopes: {scopes.join(', ')}. The last one is only for posting scores back.</li>
          <li>Copy the token here, with your account subdomain (the &quot;acme&quot; in acme.workable.com).</li>
        </ol>
      )}
      <div>
        <label className="form-label">{provider === 'greenhouse' ? 'Client ID' : 'Workable subdomain'}</label>
        <input className="form-input" value={a} onChange={(e) => setA(e.target.value)} placeholder={provider === 'workable' ? 'acme' : ''} autoComplete="off" spellCheck={false} />
      </div>
      <div>
        <label className="form-label">{provider === 'greenhouse' ? 'Client secret' : 'API access token'}</label>
        <input className="form-input" type="password" value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" spellCheck={false} />
      </div>
      <label style={check}>
        <input type="checkbox" checked={writeback} onChange={(e) => setWriteback(e.target.checked)} />
        Post each score back to the candidate in {LABEL[provider]} as a {provider === 'greenhouse' ? 'note' : 'comment'}
      </label>
      <div style={muted}>
        We check the key with {LABEL[provider]} before saving it, store it encrypted, and never show it again.
        {provider === 'greenhouse' && ' Candidates who opted out of AI review in Greenhouse are never imported or scored.'}
      </div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--rose)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || !a.trim() || !b.trim()}>
          {busy ? `Checking with ${LABEL[provider]}…` : `Connect ${LABEL[provider]}`}
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

  return (
    <div className="section-card" id="integrations">
      <div className="section-head">
        <div className="section-head-title">Integrations</div>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {!s ? <div style={muted}>Loading…</div> : (['greenhouse', 'workable'] as Provider[]).map((p, i) => {
          const st = s.integrations[p]
          return (
            <div key={p} style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: i ? 18 : 0, borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 3 }}>{LABEL[p]}</div>
                  <div style={muted}>
                    {st.connected
                      ? st.status === 'error'
                        ? <span style={{ color: 'var(--rose)' }}>{st.last_error ?? 'Connection problem. Reconnect.'}</span>
                        : `Connected (${st.hint}). Use "Import from your ATS" on any posting.`
                      : BLURB[p]}
                  </div>
                </div>
                {s.can_manage && open !== p && (
                  st.connected
                    ? <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button className="btn-ghost" disabled={busy} onClick={() => setOpen(p)}>Replace key</button>
                        <button className="btn-ghost" disabled={busy} onClick={() => disconnect(p)}>Disconnect</button>
                      </div>
                    : <button className="btn-primary" style={{ flexShrink: 0 }} onClick={() => setOpen(p)}>Connect</button>
                )}
              </div>
              {st.connected && s.can_manage && open !== p && (
                <label style={check}>
                  <input type="checkbox" checked={!!st.writeback_enabled} onChange={(e) => toggleWriteback(p, e.target.checked)} />
                  Post each score back to the candidate in {LABEL[p]} as a {p === 'greenhouse' ? 'note' : 'comment'}
                </label>
              )}
              {p === 'workable' && st.connected && st.can_comment === false && (
                <div style={muted}>We couldn&apos;t find a Workable member to post comments as, so scores won&apos;t be posted back. Reconnect while signed in with the email you use in Workable.</div>
              )}
              {!s.can_manage && !st.connected && <div style={muted}>Ask an owner or admin to connect {LABEL[p]}.</div>}
              {open === p && s.can_manage && (
                <ConnectForm provider={p} orgId={orgId} scopes={st.scopes} onCancel={() => setOpen(null)} onDone={() => { setOpen(null); load() }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
