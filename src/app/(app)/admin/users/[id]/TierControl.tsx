'use client'

import { useState } from 'react'

type Tier = 'free' | 'pro' | 'beta_pro'

const TIERS: { value: Tier; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'beta_pro', label: 'Beta Pro' },
]

const BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  pro: { bg: 'rgba(20, 184, 166, 0.15)', fg: 'var(--teal, #14b8a6)' },
  beta_pro: { bg: 'rgba(99, 102, 241, 0.15)', fg: 'var(--indigo, #6366f1)' },
  free: { bg: 'var(--surface2, rgba(120,120,120,0.12))', fg: 'var(--text3)' },
}

function badgeStyle(tier: string): React.CSSProperties {
  const c = BADGE_COLORS[tier] ?? BADGE_COLORS.free
  return {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderRadius: 5,
    padding: '2px 8px',
    background: c.bg,
    color: c.fg,
  }
}

export default function TierControl({
  userId,
  currentTier,
}: {
  userId: string
  currentTier: string
}) {
  const [tier, setTier] = useState<string>(currentTier)
  const [pending, setPending] = useState<Tier | null>(null)
  const [updated, setUpdated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function setUserTier(next: Tier) {
    if (next === tier || pending) return
    setPending(next)
    setError(null)
    setUpdated(false)
    try {
      const res = await fetch('/api/admin/set-user-tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, tier: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to update tier')
      setTier(data.tier ?? next)
      setUpdated(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update tier')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="section-card" style={{ marginBottom: 24 }}>
      <div className="section-head">
        <div className="section-head-title">Plan</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={badgeStyle(tier)}>{tier}</span>
          {updated && (
            <span style={{ fontSize: 12, color: 'var(--teal, #14b8a6)', fontWeight: 600 }}>Updated</span>
          )}
        </div>
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {TIERS.map(t => {
            const active = t.value === tier
            const loading = pending === t.value
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setUserTier(t.value)}
                disabled={active || pending !== null}
                className={active ? 'btn-primary' : 'btn-ghost'}
                style={{
                  fontSize: 13,
                  minWidth: 96,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: active || pending !== null ? 'default' : 'pointer',
                  opacity: !active && pending !== null ? 0.6 : 1,
                }}
              >
                {loading && (
                  <span
                    aria-hidden
                    style={{
                      width: 12,
                      height: 12,
                      border: '2px solid currentColor',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      display: 'inline-block',
                      animation: 'mh-spin 0.6s linear infinite',
                    }}
                  />
                )}
                {t.label}
              </button>
            )
          })}
        </div>

        {error && (
          <div style={{ fontSize: 12, color: 'var(--rose, #f43f5e)' }}>{error}</div>
        )}
      </div>

      <style>{`@keyframes mh-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
