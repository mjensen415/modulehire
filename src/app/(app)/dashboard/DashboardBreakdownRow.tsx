'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Dimension } from '@/lib/dimensions'

function strengthDots(filled: number) {
  return (
    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} style={{ color: n <= filled ? 'var(--text)' : 'var(--border2)' }}>●</span>
      ))}
    </span>
  )
}

const WEAK_HINT: Record<Dimension, string> = {
  role: 'Only a few modules show a clear role identity. Add one naming the title or function you held.',
  seniority: 'Only a few modules show seniority. Add one about team size, budget, or scope.',
  responsibility: "Only a few modules show what you owned day to day. Add one describing a core responsibility.",
  skill: 'Only a few modules show a specific skill or tool. Add one naming a competency you used.',
  domain: 'Only a few modules show an industry or problem space. Add one tying your work to a domain.',
  collaboration: 'Only a few modules show who you worked with. Add one about a cross-functional or stakeholder effort.',
}

export default function DashboardBreakdownRow({
  dim,
  label,
  count,
  strength,
  modules,
}: {
  dim: Dimension
  label: string
  count: number
  strength: number
  modules: Array<{ id: string; title: string }>
}) {
  const [open, setOpen] = useState(false)
  const weak = strength <= 2 && count > 0

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
          padding: '6px 4px', borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text2)' }}>
          <span style={{ color: 'var(--text3)', fontSize: 10, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▸</span>
          {label}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{count} module{count === 1 ? '' : 's'}</span>
          {strengthDots(strength)}
        </span>
      </button>

      {open && (
        <div style={{ padding: '4px 4px 10px 22px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {weak && (
            <div style={{ fontSize: 11.5, color: 'var(--text3)', fontStyle: 'italic', marginBottom: 4 }}>
              {WEAK_HINT[dim]}
            </div>
          )}
          {modules.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>No modules tagged for this dimension yet.</div>
          )}
          {modules.slice(0, 5).map(m => (
            <Link key={m.id} href={`/library/${m.id}`} style={{ fontSize: 12, color: 'var(--teal)', textDecoration: 'none' }}>
              {m.title}
            </Link>
          ))}
          {count > 5 && (
            <Link href={`/library?dimension=${dim}`} style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none', marginTop: 2 }}>
              See all {count} in library →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
