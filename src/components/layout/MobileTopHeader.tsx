'use client'

import Link from 'next/link'
import ModuleHireLogo from '@/components/ModuleHireLogo'

export default function MobileTopHeader({ userInitial }: { userInitial: string }) {
  return (
    <header className="mobile-top-header" style={{
      position: 'sticky', top: 0, zIndex: 50,
      height: 48, background: 'var(--bg2)',
      borderBottom: '1px solid var(--border)',
      alignItems: 'center', padding: '0 16px',
      justifyContent: 'space-between',
    }}>
      <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
        <ModuleHireLogo size="sidebar" />
      </Link>
      <div className="user-avatar">{userInitial}</div>
    </header>
  )
}
