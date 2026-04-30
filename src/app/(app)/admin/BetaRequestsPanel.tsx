'use client'

import { useState } from 'react'

type BetaRequest = {
  id: string
  email: string
  context: string | null
  marketing_opt_in: boolean
  created_at: string
  status: string
  beta_code: string | null
  invited_at: string | null
}

export function BetaRequestsPanel({
  initialRequests,
  codesLeft,
  onCodeUsed,
}: {
  initialRequests: BetaRequest[]
  codesLeft: number
  onCodeUsed: () => void
}) {
  const [requests, setRequests] = useState<BetaRequest[]>(initialRequests)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<Record<string, string>>({})

  // Manual add form
  const [addEmail, setAddEmail] = useState('')
  const [addNote, setAddNote] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')

  const addManually = async () => {
    setAddError('')
    if (!addEmail || !addEmail.includes('@')) return setAddError('Valid email required')
    setAddLoading(true)
    try {
      const res = await fetch('/api/admin/beta-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail.trim(), context: addNote.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to add')
      setRequests(prev => [data.request, ...prev])
      setAddEmail('')
      setAddNote('')
    } catch (e) {
      setAddError((e as Error).message)
    } finally {
      setAddLoading(false)
    }
  }

  const sendInvite = async (requestId: string, resend = false) => {
    setLoading(requestId)
    setError(prev => ({ ...prev, [requestId]: '' }))

    try {
      const res = await fetch('/api/admin/send-beta-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, resend }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send invite')

      setRequests(prev =>
        prev.map(r =>
          r.id === requestId
            ? { ...r, status: 'invited', beta_code: data.code, invited_at: new Date().toISOString() }
            : r
        )
      )
      onCodeUsed()
    } catch (e) {
      setError(prev => ({ ...prev, [requestId]: (e as Error).message }))
    } finally {
      setLoading(null)
    }
  }

  const pending = requests.filter(r => r.status !== 'invited')
  const invited = requests.filter(r => r.status === 'invited')

  return (
    <div className="section-card" style={{ marginTop: 24 }}>
      <div className="section-head">
        <div className="section-head-title">Beta requests</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {pending.length} pending &middot; {invited.length} invited
          </span>
          <span
            style={{
              fontSize: 12,
              padding: '3px 10px',
              borderRadius: 20,
              background: codesLeft > 0 ? 'var(--teal-dim, #e8f5f0)' : 'var(--red-dim, #fef2f2)',
              color: codesLeft > 0 ? 'var(--teal)' : 'var(--red, #dc2626)',
              fontWeight: 600,
            }}
          >
            {codesLeft} codes available
          </span>
        </div>
      </div>

      {/* Manual add form */}
      <div style={{ padding: '12px 20px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</div>
          <input
            type="email"
            placeholder="user@example.com"
            value={addEmail}
            onChange={e => { setAddEmail(e.target.value); setAddError('') }}
            onKeyDown={e => e.key === 'Enter' && addManually()}
            style={{ width: 220, padding: '6px 10px', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Note <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></div>
          <input
            type="text"
            placeholder="e.g. Friend referral"
            value={addNote}
            onChange={e => setAddNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addManually()}
            style={{ width: 200, padding: '6px 10px', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}
          />
        </div>
        <button
          onClick={addManually}
          disabled={addLoading}
          className="btn-primary"
          style={{ fontSize: 13, padding: '7px 16px' }}
        >
          {addLoading ? 'Adding…' : '+ Add to list'}
        </button>
        {addError && (
          <span style={{ fontSize: 12, color: 'var(--red, #dc2626)', alignSelf: 'center' }}>{addError}</span>
        )}
      </div>

      {codesLeft === 0 && (
        <div style={{ margin: '0 20px 16px', padding: '10px 14px', background: 'var(--red-dim, #fef2f2)', border: '1px solid var(--border2)', borderRadius: 6, fontSize: 12, color: 'var(--red, #dc2626)' }}>
          No beta codes available. Generate more using the Beta Codes section below before sending invites.
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Note</th>
              <th>Mkt</th>
              <th>Requested</th>
              <th>Status</th>
              <th>Code</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '24px 0' }}>
                  No beta requests yet.
                </td>
              </tr>
            )}
            {requests.map(r => (
              <tr key={r.id}>
                <td style={{ fontSize: 12 }}>{r.email}</td>
                <td style={{ fontSize: 12, color: 'var(--text2)', maxWidth: 220 }}>
                  {r.context
                    ? <span title={r.context}>{r.context.length > 60 ? r.context.slice(0, 60) + '…' : r.context}</span>
                    : <span style={{ color: 'var(--text3)' }}>—</span>
                  }
                </td>
                <td style={{ fontSize: 12, textAlign: 'center', color: r.marketing_opt_in ? 'var(--teal)' : 'var(--text3)' }}>
                  {r.marketing_opt_in ? 'Yes' : 'No'}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                  {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                </td>
                <td>
                  <span
                    className={`plan-chip ${r.status === 'invited' ? 'plan-pro' : 'plan-free'}`}
                  >
                    {r.status}
                  </span>
                </td>
                <td style={{ fontSize: 12, fontFamily: 'var(--mono)', color: r.beta_code ? 'var(--teal)' : 'var(--text3)', letterSpacing: '0.05em' }}>
                  {r.beta_code ?? '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {r.status === 'invited' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                          {r.invited_at
                            ? new Date(r.invited_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : 'Sent'}
                        </span>
                        <button
                          onClick={() => sendInvite(r.id, true)}
                          disabled={loading === r.id || codesLeft === 0}
                          style={{
                            fontSize: 11, padding: '3px 10px', cursor: 'pointer',
                            background: 'var(--bg2)', border: '1px solid var(--border2)',
                            borderRadius: 5, color: 'var(--text2)',
                            opacity: codesLeft === 0 ? 0.4 : 1,
                          }}
                        >
                          {loading === r.id ? 'Sending…' : 'Resend'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => sendInvite(r.id)}
                        disabled={loading === r.id || codesLeft === 0}
                        className="btn-primary"
                        style={{ fontSize: 11, padding: '4px 12px', opacity: codesLeft === 0 ? 0.4 : 1 }}
                      >
                        {loading === r.id ? 'Sending…' : 'Send invite'}
                      </button>
                    )}
                    {error[r.id] && (
                      <div style={{ fontSize: 11, color: 'var(--red, #dc2626)' }}>
                        {error[r.id]}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
