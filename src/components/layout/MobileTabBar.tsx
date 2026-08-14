'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isProTier } from '@/lib/plan'
import {
  IconGrid,
  IconStar,
  IconBlocks,
  IconBriefcase2,
  IconClipboard,
  IconTarget,
  IconFiles,
  IconResume,
  IconPerson,
  IconSettings,
  IconUpgrade,
  IconBuilding,
} from './AppSidebar'

function IconDots() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="3" cy="7.5" r="1.3" fill="currentColor" />
      <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" />
      <circle cx="12" cy="7.5" r="1.3" fill="currentColor" />
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginLeft: 'auto', color: 'var(--text3)', flexShrink: 0 }}>
      <path d="M5.25 2.5 9.5 7l-4.25 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const TABS = [
  { href: '/dashboard', label: 'Home', icon: IconGrid, exact: true },
  { href: '/generate', label: 'Generate', icon: IconStar, exact: false },
  { href: '/library', label: 'Library', icon: IconBlocks, exact: false },
  { href: '/job-tracker', label: 'Tracker', icon: IconBriefcase2, exact: false },
]

export default function MobileTabBar({ tier }: { tier?: string }) {
  const pathname = usePathname()
  const [sheetOpen, setSheetOpen] = useState(false)

  function active(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  const moreItems = [
    { href: '/interview-prep', label: 'Interview Prep', icon: IconClipboard },
    { href: '/matches', label: 'Job Matches', icon: IconTarget },
    { href: '/applications', label: 'Applications', icon: IconFiles },
    { href: '/resumes', label: 'My Resumes', icon: IconResume },
    { href: '/my-info', label: 'My Info', icon: IconPerson },
    { href: '/account', label: 'Account', icon: IconSettings },
    ...(!isProTier(tier) ? [{ href: '/billing', label: 'Upgrade', icon: IconUpgrade }] : []),
    { href: '/business/dashboard', label: 'For Business', icon: IconBuilding },
  ]

  const moreActive = moreItems.some((item) => pathname.startsWith(item.href))

  return (
    <>
      <nav className="mobile-tab-bar" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
        height: 'var(--mobile-bar-h)',
        background: 'var(--bg2)', borderTop: '1px solid var(--border)',
        alignItems: 'stretch',
      }}>
        {TABS.map((tab) => {
          const isActive = active(tab.href, tab.exact)
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 3, fontSize: 10, fontWeight: 600,
                color: isActive ? 'var(--teal)' : 'var(--text3)', textDecoration: 'none',
                cursor: 'pointer', transition: 'color 0.15s',
              }}
            >
              <Icon />
              {tab.label}
            </Link>
          )
        })}
        <button
          onClick={() => setSheetOpen(true)}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 3, fontSize: 10, fontWeight: 600,
            color: moreActive || sheetOpen ? 'var(--teal)' : 'var(--text3)', textDecoration: 'none',
            cursor: 'pointer', transition: 'color 0.15s', background: 'none', border: 'none',
            fontFamily: 'var(--font)',
          }}
        >
          <IconDots />
          More
        </button>
      </nav>

      {/* Backdrop */}
      {sheetOpen && (
        <div
          onClick={() => setSheetOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 54 }}
        />
      )}

      {/* More sheet */}
      <div
        style={{
          position: 'fixed', bottom: 'var(--mobile-bar-h)', left: 0, right: 0, zIndex: 55,
          background: 'var(--bg2)', borderTop: '1px solid var(--border2)',
          borderRadius: '16px 16px 0 0', padding: '16px 12px 8px',
          transform: sheetOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.25s ease',
          maxHeight: '70vh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 32, height: 3, background: 'var(--border2)', borderRadius: 2, margin: '0 auto 14px' }} />

        {moreItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSheetOpen(false)}
              className={`nav-item${isActive ? ' active' : ''}`}
              style={{ width: '100%' }}
            >
              <span className="nav-item-icon"><Icon /></span>
              {item.label}
              <IconChevronRight />
            </Link>
          )
        })}
      </div>
    </>
  )
}
