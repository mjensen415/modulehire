'use client'

// Settings → Integrations: connect an ATS with a key the customer creates in their own account.
// Fields, setup steps and permissions per ATS come from src/lib/business/ats/registry.ts.
// None of these need partner status.
import { useEffect, useRef, useState } from 'react'
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

const BETA: Provider[] = ['bamboohr']

function ConnectForm({ provider, orgId, onDone, onCancel, replacing }: { provider: Provider; orgId: string; onDone: () => void; onCancel: () => void; replacing?: boolean }) {
  const info = PROVIDER_INFO[provider]
  const [vals, setVals] = useState<Record<string, string>>({})
  const [writeback, setWriteback] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const firstRef = useRef<HTMLInputElement>(null)
  useEffect(() => { firstRef.current?.focus() }, [])

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
    <form onSubmit={submit} className="bs-form" aria-label={`${replacing ? 'Update' : 'Connect'} ${info.label}`}>
      <div className="bs-form-grid">
        {info.fields.map((f, i) => (
          <label key={f.name} className="bs-field">
            {f.label}
            <input
              ref={i === 0 ? firstRef : undefined}
              className="bs-input"
              type={f.secret ? 'password' : 'text'}
              value={vals[f.name] ?? ''}
              placeholder={f.placeholder ?? ''}
              onChange={(e) => setVals((v) => ({ ...v, [f.name]: e.target.value }))}
              autoComplete={f.secret ? 'new-password' : 'off'}
              spellCheck={false}
            />
          </label>
        ))}
      </div>
      <details className="bs-details" open={!replacing}>
        <summary>Where do I find this?</summary>
        <ol>
          {info.steps.map((st) => <li key={st}>{st}</li>)}
          <li>Permissions: {info.permissions.join(', ')}.{info.permissions.length > 1 ? ` ${info.writebackPermission} is only for posting scores back.` : ''}</li>
        </ol>
      </details>
      <label className="bs-check">
        <input type="checkbox" checked={writeback} onChange={(e) => setWriteback(e.target.checked)} />
        Post each score back to the candidate in {info.label} as a {info.noteWord}
      </label>
      <p className="bs-note">
        We check the key with {info.label} before saving it, store it encrypted, and never show it again.
        {info.hasOptOut && ` Candidates who opted out of AI review in ${info.label} are never imported or scored.`}
      </p>
      {error && <div className="bs-error" role="alert">{error}</div>}
      <div className="bs-form-actions">
        <button type="submit" className="biz-btn biz-btn-sm" disabled={busy || !complete}>
          {busy ? `Checking with ${info.label}…` : 'Test and connect'}
        </button>
        <button type="button" className="biz-btn biz-btn-ghost biz-btn-sm" onClick={onCancel}>Cancel</button>
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

  const connected = s ? PROVIDERS.filter((p) => s.integrations[p]?.connected) : []
  const available = s ? PROVIDERS.filter((p) => !s.integrations[p]?.connected) : []
  const done = () => { setOpen(null); load() }

  return (
    <div className="bs-panel" id="integrations">
      <p className="bs-intro">
        Connect your ATS with a key you create there. We pull in-process candidates for a job with
        &quot;Import from your ATS&quot;, score them, and can post each score back as a note.
      </p>

      {!s ? <p className="bs-note" role="status">Loading…</p> : (
        <>
          {connected.length > 0 && (
            <section className="bs-section" aria-labelledby="bs-conn-h">
              <h2 id="bs-conn-h" className="bs-eyebrow">Connected</h2>
              {connected.map((p) => {
                const st = s.integrations[p]
                const info = PROVIDER_INFO[p]
                const bad = st.status === 'error'
                return (
                  <div key={p} className="bs-conn">
                    <div className="bs-conn-row">
                      <span className={`bs-av${bad ? '' : ' teal'}`} aria-hidden="true">{info.label.charAt(0)}</span>
                      <div className="bs-conn-text">
                        <b>{info.label}</b>
                        <span>
                          {[st.hint, bad ? (st.last_error ?? 'Connection problem. Update the key.') : null].filter(Boolean).join(' · ') || 'Connected'}
                        </span>
                      </div>
                      <span className={`bs-status ${bad ? 'bad' : 'ok'}`}>{bad ? 'Needs attention' : 'Working'}</span>
                      {s.can_manage && open !== p && (
                        <div className="bs-conn-actions">
                          <label className="bs-check">
                            <input type="checkbox" checked={!!st.writeback_enabled} onChange={(e) => toggleWriteback(p, e.target.checked)} />
                            Post scores as {info.noteWord}s
                          </label>
                          <button type="button" className={`biz-btn biz-btn-sm ${bad ? 'biz-btn-dark' : 'biz-btn-ghost'}`} disabled={busy} onClick={() => setOpen(p)}>Update key</button>
                          <button type="button" className="biz-btn biz-btn-ghost biz-btn-sm" disabled={busy} onClick={() => disconnect(p)}>Disconnect</button>
                        </div>
                      )}
                    </div>
                    {p === 'workable' && st.can_comment === false && (
                      <p className="bs-note">We couldn&apos;t find a Workable member to post comments as, so scores won&apos;t be posted back. Reconnect while signed in with the email you use in Workable.</p>
                    )}
                    {open === p && s.can_manage && (
                      <ConnectForm provider={p} orgId={orgId} replacing onCancel={() => setOpen(null)} onDone={done} />
                    )}
                  </div>
                )
              })}
            </section>
          )}

          {available.length > 0 && (
            <section className="bs-section" aria-labelledby="bs-avail-h">
              <h2 id="bs-avail-h" className="bs-eyebrow">Available</h2>
              <div className="bs-avail">
                {available.map((p) => {
                  const info = PROVIDER_INFO[p]
                  const isOpen = open === p && s.can_manage
                  return (
                    <div key={p} className={`bs-avail-card${isOpen ? ' open' : ''}`}>
                      <div className="bs-avail-name">
                        <span className={`bs-av sm${isOpen ? ' teal' : ''}`} aria-hidden="true">{info.label.charAt(0)}</span>
                        <span>{info.label}</span>
                        {BETA.includes(p) && <span className="bs-beta">Beta</span>}
                      </div>
                      {isOpen ? (
                        <ConnectForm provider={p} orgId={orgId} onCancel={() => setOpen(null)} onDone={done} />
                      ) : (
                        <>
                          <p className="bs-note">{info.blurb}</p>
                          {s.can_manage
                            ? <button type="button" className="biz-btn biz-btn-sm bs-connect-btn" aria-label={`Connect ${info.label}`} onClick={() => setOpen(p)}>Connect</button>
                            : <p className="bs-note">Ask an owner or admin to connect {info.label}.</p>}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}
          <p className="bs-note">Using ADP or something else? Import a file export from any posting.</p>
        </>
      )}
    </div>
  )
}
