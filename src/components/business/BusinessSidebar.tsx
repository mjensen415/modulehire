'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

function IconHouse() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M2 7l5.5-5 5.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 6v6.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}
function IconBriefcase() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 5V3.5A1.5 1.5 0 0 1 6.5 2h2A1.5 1.5 0 0 1 10 3.5V5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1 9h13" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}
function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.5 1v1.5M7.5 12.5V14M14 7.5h-1.5M2.5 7.5H1M12.3 2.7l-1.06 1.06M3.76 11.24 2.7 12.3M12.3 12.3l-1.06-1.06M3.76 3.76 2.7 2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
function IconPerson() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M1.5 12.5c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

const NAV_ITEMS = [
  { href: '/business/dashboard', label: 'Dashboard', icon: IconHouse },
  { href: '/business/jobs', label: 'Jobs', icon: IconBriefcase },
  { href: '/business/settings', label: 'Settings', icon: IconSettings },
]

export default function BusinessSidebar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname()
  const [orgName, setOrgName] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/business/organizations')
      .then((r) => r.json())
      .then((data) => {
        const org = data.orgs?.[0]
        if (org) setOrgName(org.name)
      })
      .catch(() => null)
  }, [])

  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg2)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div style={{ padding: '18px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          ModuleHire
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--teal)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
          for Business
        </div>
        {orgName && (
          <div style={{
            marginTop: 10,
            padding: '6px 10px',
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {orgName}
          </div>
        )}
      </div>

      {/* Nav */}
      <div style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '9px 10px',
                borderRadius: 7,
                fontSize: 13.5,
                fontWeight: 500,
                textDecoration: 'none',
                color: active ? 'var(--teal)' : 'var(--text2)',
                background: active ? 'var(--teal-dim)' : 'transparent',
                border: `1px solid ${active ? 'var(--teal-glow)' : 'transparent'}`,
              }}
            >
              <Icon />
              {label}
            </Link>
          )
        })}

        {/* Context switcher */}
        <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 10px 2px' }}>
          Switch context
        </div>
        <Link
          href="/dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 10px',
            borderRadius: 7,
            fontSize: 13.5,
            fontWeight: 500,
            textDecoration: 'none',
            color: 'var(--text2)',
          }}
        >
          <IconPerson />
          Personal App
        </Link>
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 12px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {userEmail ?? ''}
        </div>
      </div>
    </div>
  )
}
