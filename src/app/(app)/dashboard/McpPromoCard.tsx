'use client'

// Dashboard card pointing to /mcp. Dismissal is remembered per browser (localStorage); it renders
// nothing until mounted so a dismissed card never flashes in.
import { useEffect, useState } from 'react'
import Link from 'next/link'

const KEY = 'mh-mcp-card-dismissed'

export default function McpPromoCard() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let dismissed = false
    try {
      dismissed = localStorage.getItem(KEY) === '1'
    } catch {
      // Storage blocked: show the card; dismissing just won't stick.
    }
    // Read after mount on purpose: localStorage isn't available during server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(!dismissed)
  }, [])

  if (!show) return null

  const dismiss = () => {
    setShow(false)
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      // Ignore: see above.
    }
  }

  return (
    <div className="section-card" style={{ padding: '16px 18px', position: 'relative' }}>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>New</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4, paddingRight: 24 }}>Use ModuleHire in Claude or ChatGPT</div>
      <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 12 }}>
        Save wins to your library, tailor resumes, and edit them line by line from your AI assistant.
      </div>
      <Link href="/mcp" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
        Connect in 2 minutes →
      </Link>
    </div>
  )
}
