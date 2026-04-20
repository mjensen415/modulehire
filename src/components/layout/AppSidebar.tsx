'use client'

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar">
      <Link href="/" className="sidebar-logo">
        <div className="nav-logo-mark">MH</div>
        <span>ModuleHire Labs</span>
      </Link>
      
      <div className="sidebar-nav">
        <Link href="/dashboard" className={`sidebar-link ${pathname === '/dashboard' ? 'active' : ''}`}>
          <svg className="s-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <rect x="1" y="1" width="5" height="5" rx="1" />
            <rect x="10" y="1" width="5" height="5" rx="1" />
            <rect x="1" y="10" width="5" height="5" rx="1" />
            <rect x="10" y="10" width="5" height="5" rx="1" />
          </svg>
          Dashboard
        </Link>
        <Link href="/library" className={`sidebar-link ${pathname === '/library' ? 'active' : ''}`}>
          <svg className="s-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <rect x="1" y="3" width="14" height="2" rx="0.5" />
            <rect x="1" y="7" width="14" height="2" rx="0.5" />
            <rect x="1" y="11" width="14" height="2" rx="0.5" />
          </svg>
          Library
        </Link>
        <Link href="/generate" className={`sidebar-link ${pathname.startsWith('/generate') ? 'active' : ''}`}>
          <svg className="s-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M8 1l1.5 3 3.5.5-2.5 2.5.5 3.5L8 9l-3 1.5.5-3.5L3 4.5l3.5-.5z" />
          </svg>
          Generate
        </Link>
        <Link href="/settings" className={`sidebar-link ${pathname === '/settings' ? 'active' : ''}`}>
          <svg className="s-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" />
          </svg>
          Settings
        </Link>
        
        <div className="sidebar-divider"></div>
        <Link href="/docs" className="sidebar-link-sm">Help</Link>
        <Link href="#" className="sidebar-link-sm">Changelog</Link>
      </div>
    </aside>
  );
}
