'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Profile = { id: string; name: string; module_count: number; is_active: boolean }

export default function DashboardProfileSwitch({ activeProfileId }: { activeProfileId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (open) { setOpen(false); return }
    setOpen(true)
    if (profiles.length === 0) {
      setLoading(true)
      try {
        const res = await fetch('/api/profiles')
        const data = await res.json()
        setProfiles(data.profiles ?? [])
      } finally {
        setLoading(false)
      }
    }
  }

  async function activate(id: string) {
    if (id === activeProfileId) { setOpen(false); return }
    await fetch(`/api/profiles/${id}/activate`, { method: 'POST' })
    setOpen(false)
    router.refresh()
  }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={toggle} className="btn-ghost" style={{ fontSize: 11.5, padding: '5px 10px' }}>
        Change
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 20, minWidth: 180,
          background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)', padding: 6,
        }}>
          {loading && <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 10px' }}>Loading…</div>}
          {!loading && profiles.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => activate(p.id)}
              style={{
                display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left',
                background: p.is_active ? 'var(--teal-dim)' : 'none', color: p.is_active ? 'var(--teal)' : 'var(--text)',
                border: 'none', borderRadius: 6, padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              <span>{p.name}</span>
              <span style={{ color: 'var(--text3)', fontSize: 11 }}>{p.module_count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
