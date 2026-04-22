'use client'

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function IconGrid() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="1" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8.5" y="1" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="1" y="8.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  );
}
function IconBlocks() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M1.5 4.5h12M1.5 7.5h8M1.5 10.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <rect x="10" y="6.5" width="4.5" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  );
}
function IconStar() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 1.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6L7.5 9.7l-3.2 1.7.6-3.6L2.3 5.3l3.6-.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  );
}
function IconTarget() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="7.5" cy="7.5" r="3" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="7.5" cy="7.5" r="1" fill="currentColor"/>
    </svg>
  );
}
function IconFiles() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M8 1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6L8 1Z" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 1v5h5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M5 9h5M5 11.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7.5 1v1.5M7.5 12.5V14M14 7.5h-1.5M2.5 7.5H1M12.3 2.7l-1.06 1.06M3.76 11.24 2.7 12.3M12.3 12.3l-1.06-1.06M3.76 3.76 2.7 2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
export default function AppSidebar({ footer }: { footer?: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: <IconGrid />, exact: true },
    { href: '/library', label: 'My Modules', icon: <IconBlocks />, exact: false },
    { href: '/generate', label: 'Generate', icon: <IconStar />, exact: false },
    { href: '/matches', label: 'Job Matches', icon: <IconTarget />, exact: false },
    { href: '/applications', label: 'Applications', icon: <IconFiles />, exact: false },
  ];

  function active(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  return (
    <aside className="app-sidebar">
      <Link href="/dashboard" className="sidebar-logo">
        <div className="logo-mark">MH</div>
        ModuleHire Labs
      </Link>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Workspace</div>
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item${active(item.href, item.exact) ? ' active' : ''}`}
          >
            <span className="nav-item-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Account</div>
        <Link href="/settings" className={`nav-item${pathname === '/settings' ? ' active' : ''}`}>
          <span className="nav-item-icon"><IconSettings /></span>
          Settings
        </Link>
      </div>

      {footer}
    </aside>
  );
}
