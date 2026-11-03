'use client'

import { useState } from 'react'
import s from './mcp.module.css'

export default function CopyButton({ text, label, compact = false }: { text: string; label: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard blocked (insecure context or permissions): the text is on screen to copy by hand.
    }
  }
  return (
    <button type="button" onClick={copy} className={compact ? s.copyCompact : s.copy} aria-label={label} title={label}>
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="5" y="5" width="8.5" height="8.5" rx="1.8" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 5V3.8A1.8 1.8 0 0 0 8.7 2H3.8A1.8 1.8 0 0 0 2 3.8v4.9a1.8 1.8 0 0 0 1.8 1.8H5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )}
      {!compact && <span>{copied ? 'Copied' : 'Copy'}</span>}
      <span className={s.srOnly} aria-live="polite">{copied ? 'Copied' : ''}</span>
    </button>
  )
}
