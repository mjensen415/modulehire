'use client'

// Settings → Integrations: connect Greenhouse with a Harvest v3 (OAuth) client ID and secret the
// customer creates in their own Greenhouse account. Works without Greenhouse partner status.
import { useEffect, useState } from 'react'

type Status = {
  connected: boolean
  can_manage: boolean
  client_id_hint: string | null
  writeback_enabled: boolean
  status: 'connected' | 'error' | null
  last_error: string | null
  scopes: string[]
}

export default function IntegrationsCard({ orgId }: { orgId: string }) {
  const [s, setS] = useState<Status | null>(null)
  const [clientId, setClientId] = useState('')
  const [secret, setSecret] = useState('')
  const [writeback, setWriteback] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  async function load() {
    const res = await fetch(`/api/business/integrations/greenhouse?org_id=${orgId}`)
    if (res.ok) setS(await res.json())
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  async function connect(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/business/integrations/greenhouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, client_id: clientId, client_secret: secret, writeback_enabled: writeback }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not connect')
      setClientId(''); setSecret(''); setShowForm(false)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleWriteback(v: boolean) {
    setS((p) => (p ? { ...p, writeback_enabled: v } : p))
    await fetch('/api/business/integrations/greenhouse', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId, writeback_enabled: v }),
    })
  }

  async function disconnect() {
    setBusy(true)
    await fetch(`/api/business/integrations/greenhouse?org_id=${orgId}`, { method: 'DELETE' })
    setBusy(false)
    await load()
  }

  const muted = { fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.55 } as const

  return (
    <div className="section-card" id="integrations">
      <div className="section-head">
        <div className="section-head-title">Integrations</div>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 3 }}>Greenhouse</div>
            <div style={muted}>
              {!s ? 'Loading…'
                : s.connected
                  ? s.status === 'error'
                    ? <span style={{ color: 'var(--rose)' }}>{s.last_error ?? 'Connection problem. Reconnect.'}</span>
                    : `Connected (client ${s.client_id_hint}). Use "Import from your ATS" on any posting.`
                  : 'Pull candidates and resumes from a Greenhouse job, and post each score back as a note.'}
            </div>
          </div>
          {s?.can_manage && !showForm && (
            s.connected
              ? <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-ghost" disabled={busy} onClick={() => setShowForm(true)}>Replace key</button>
                  <button className="btn-ghost" disabled={busy} onClick={disconnect}>Disconnect</button>
                </div>
              : <button className="btn-primary" onClick={() => setShowForm(true)}>Connect</button>
          )}
        </div>

        {s?.connected && s.can_manage && !showForm && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--text2)' }}>
            <input type="checkbox" checked={s.writeback_enabled} onChange={(e) => toggleWriteback(e.target.checked)} />
            Post each score back to the candidate in Greenhouse as a note
          </label>
        )}

        {s && !s.can_manage && !s.connected && <div style={muted}>Ask an owner or admin to connect Greenhouse.</div>}

        {showForm && s?.can_manage && (
          <form onSubmit={connect} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ol style={{ ...muted, margin: 0, paddingLeft: 18 }}>
              <li>In Greenhouse, open Configure (the gear), Dev Center, API Credential Management, then <b>Create new API credentials</b>.</li>
              <li>Choose <b>Harvest V3 (OAuth)</b>, leave Partner blank, and name it ModuleHire.</li>
              <li>Give it these permissions: {s.scopes.map((x) => x.replace('harvest:', '')).join(', ')}. The last one is only for posting scores back.</li>
              <li>Copy the client ID and client secret here. Greenhouse shows the secret once.</li>
            </ol>
            <div>
              <label className="form-label">Client ID</label>
              <input className="form-input" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck={false} />
            </div>
            <div>
              <label className="form-label">Client secret</label>
              <input className="form-input" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" spellCheck={false} />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--text2)' }}>
              <input type="checkbox" checked={writeback} onChange={(e) => setWriteback(e.target.checked)} />
              Post each score back to the candidate in Greenhouse as a note
            </label>
            <div style={muted}>
              We check the key with Greenhouse before saving it, store the secret encrypted, and never show it again.
              Candidates who opted out of AI review in Greenhouse are never imported or scored.
            </div>
            {error && <div style={{ fontSize: 12.5, color: 'var(--rose)' }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-ghost" onClick={() => { setShowForm(false); setError('') }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={busy || !clientId.trim() || !secret.trim()}>
                {busy ? 'Checking with Greenhouse…' : 'Connect Greenhouse'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
