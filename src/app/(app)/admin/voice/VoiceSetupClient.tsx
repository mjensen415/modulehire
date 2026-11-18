'use client'

import { useEffect, useState } from 'react'

const card: React.CSSProperties = { padding: 20, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)' }

type Status = { has_api_key: boolean; agent_id: string | null; configured: boolean; enabled: boolean }

export default function VoiceSetupClient() {
  const [status, setStatus] = useState<Status | null>(null)
  const [creating, setCreating] = useState(false)
  const [newAgentId, setNewAgentId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/voice').then((r) => r.json()).then(setStatus).catch(() => setError('Could not load status'))
  }, [])

  async function create() {
    setCreating(true)
    setError('')
    const res = await fetch('/api/admin/voice', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setCreating(false)
    if (!res.ok) setError(data.error || 'Failed')
    else setNewAgentId(data.agent_id)
  }

  const row = (label: string, ok: boolean, detail?: string) => (
    <div style={{ display: 'flex', gap: 10, fontSize: 13.5, padding: '6px 0' }}>
      <span style={{ color: ok ? 'var(--teal)' : 'var(--text3)', fontWeight: 700 }}>{ok ? '✓' : '○'}</span>
      <span style={{ color: 'var(--text)' }}>{label}</span>
      {detail && <code style={{ fontSize: 12, color: 'var(--text3)' }}>{detail}</code>}
    </div>
  )

  return (
    <div style={{ maxWidth: 640 }}>
      {status && (
        <div style={{ ...card, marginBottom: 16 }}>
          {row('ELEVENLABS_API_KEY set in Vercel', status.has_api_key)}
          {row('ELEVENLABS_AGENT_ID set in Vercel', !!status.agent_id, status.agent_id ?? undefined)}
          {row('Voice interviews live (VOICE_INTERVIEWS_ENABLED is not "false")', status.enabled)}
        </div>
      )}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Create the interviewer agent</div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
          Creates the agent on your ElevenLabs account with signed-URL auth and a 20 minute cap. Do this once, then add the id
          to Vercel as ELEVENLABS_AGENT_ID and redeploy. Then, in the ElevenLabs dashboard, open the agent and set audio
          recording off and transcript retention to 30 days.
        </p>
        <button className="btn-primary" onClick={create} disabled={creating || !status?.has_api_key}>
          {creating ? 'Creating…' : status?.agent_id ? 'Create another agent' : 'Create agent'}
        </button>
        {newAgentId && (
          <div style={{ marginTop: 12, fontSize: 13 }}>
            Agent id: <code style={{ userSelect: 'all' }}>{newAgentId}</code>
          </div>
        )}
        {error && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--rose)' }}>{error}</div>}
      </div>
    </div>
  )
}
