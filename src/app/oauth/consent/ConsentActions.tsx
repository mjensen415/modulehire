'use client'

import { useState, useTransition } from 'react'
import { decideAuthorization } from './actions'

export default function ConsentActions({ authorizationId, clientName }: { authorizationId: string; clientName: string }) {
  const [choice, setChoice] = useState<'approve' | 'deny' | null>(null)
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()

  const decide = (approve: boolean) => {
    setChoice(approve ? 'approve' : 'deny')
    setError('')
    startTransition(async () => {
      const result = await decideAuthorization(authorizationId, approve)
      if ('url' in result) {
        // Stay disabled while the browser leaves for the app.
        window.location.assign(result.url)
      } else {
        setError(result.error)
        setChoice(null)
      }
    })
  }

  return (
    <>
      {error && (
        <p role="alert" style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 12, textAlign: 'center' }}>
          {error}
        </p>
      )}
      <button className="btn-primary-full" type="button" onClick={() => decide(true)} disabled={choice !== null}>
        {choice === 'approve' ? 'Connecting...' : `Allow ${clientName}`}
      </button>
      <button
        type="button"
        onClick={() => decide(false)}
        disabled={choice !== null}
        style={{
          display: 'block',
          width: '100%',
          fontSize: 14.5,
          fontWeight: 600,
          background: 'none',
          color: 'var(--text2)',
          border: '1px solid var(--border2)',
          borderRadius: 8,
          padding: '12px 24px',
          cursor: choice === null ? 'pointer' : 'default',
          fontFamily: 'var(--font)',
        }}
      >
        {choice === 'deny' ? 'Cancelling...' : 'Cancel'}
      </button>
    </>
  )
}
