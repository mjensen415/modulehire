'use client'

// "AI apps" under Connected accounts: the OAuth clients (Claude, ChatGPT, Cursor...) allowed to
// use this account through the MCP server, each with a Disconnect button.
import { useEffect, useState } from 'react'
import Link from 'next/link'

type App = { client_id: string; name: string; uri: string | null; logo_uri: string | null; granted_at: string }

function hostOf(uri: string | null): string | null {
  if (!uri) return null
  try {
    return new URL(uri).host
  } catch {
    return null
  }
}

export default function ConnectedAiApps() {
  const [apps, setApps] = useState<App[] | null>(null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/connected-apps')
      .then((r) => r.json())
      .then((d) => setApps(d.apps ?? []))
      .catch(() => {
        setApps([])
        setError('Could not load connected AI apps.')
      })
  }, [])

  async function disconnect(clientId: string) {
    setBusy(clientId)
    setError('')
    try {
      const res = await fetch(`/api/connected-apps?client_id=${encodeURIComponent(clientId)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not disconnect that app.')
      setApps((prev) => (prev ?? []).filter((a) => a.client_id !== clientId))
      setConfirming(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ marginTop: 32 }}>
      <div className="section-title">AI apps</div>
      <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 8, lineHeight: 1.5 }}>
        Apps you allowed to use ModuleHire for you. Disconnecting one stops it right away.
      </div>
      {error && <div style={{ fontSize: 13, color: 'var(--rose)', margin: '8px 0' }}>{error}</div>}

      {apps === null ? (
        <div style={{ fontSize: 13, color: 'var(--text3)', padding: '16px 0' }}>Loading...</div>
      ) : apps.length === 0 ? (
        <div className="connected-row">
          <div className="connected-left">
            <div className="connected-icon" style={{ background: 'var(--teal-dim)', color: 'var(--teal)', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 800 }}>AI</div>
            <div>
              <div className="connected-name">No AI apps connected</div>
              <div className="connected-status">Use your library from Claude, ChatGPT, or Cursor.</div>
            </div>
          </div>
          <Link href="/mcp" className="btn-connect" style={{ textDecoration: 'none' }}>
            Set up
          </Link>
        </div>
      ) : (
        apps.map((app) => {
          const host = hostOf(app.uri)
          return (
            <div className="connected-row" key={app.client_id}>
              <div className="connected-left">
                <div className="connected-icon" style={{ background: 'var(--surface2)', color: 'var(--text2)', fontWeight: 800, fontSize: 13 }}>
                  {app.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="connected-name">{app.name}</div>
                  <div className="connected-status">
                    Connected {new Date(app.granted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    {host ? ` · ${host}` : ''}
                  </div>
                </div>
              </div>
              {confirming === app.client_id ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-danger" disabled={busy === app.client_id} onClick={() => disconnect(app.client_id)} style={{ padding: '7px 14px' }}>
                    {busy === app.client_id ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                  <button className="btn-connect" onClick={() => setConfirming(null)} disabled={busy === app.client_id}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button className="btn-connect" onClick={() => setConfirming(app.client_id)}>
                  Disconnect
                </button>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
