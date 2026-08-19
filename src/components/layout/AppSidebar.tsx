'use client'

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import ModuleHireLogo from '@/components/ModuleHireLogo';
import FeedbackModal from '@/components/FeedbackModal';
import ThemeToggle from '@/components/ThemeToggle';
import { isProTier } from '@/lib/plan';

type ProfileSummary = { id: string; name: string; module_count: number; is_active: boolean };

function IconSwap() {
  return (
    <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
      <path d="M4 3.5h8L10 1.5M11 11.5H3l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
      <path d="M2.5 7.5 6 11l6.5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ProfileSwitcher({ activeProfileName, activeProfileId }: { activeProfileName: string; activeProfileId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function loadProfiles() {
    setLoading(true);
    try {
      const res = await fetch('/api/profiles');
      const data = await res.json();
      setProfiles(data.profiles ?? []);
    } catch {
      // Leave list empty — user can retry by reopening.
    } finally {
      setLoading(false);
    }
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) loadProfiles();
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function switchTo(id: string) {
    if (id === activeProfileId) { setOpen(false); return; }
    setSwitching(id);
    try {
      await fetch(`/api/profiles/${id}/activate`, { method: 'POST' });
      router.refresh();
      await loadProfiles();
      setOpen(false);
    } finally {
      setSwitching(null);
    }
  }

  async function createProfile() {
    if (!newName.trim() || savingNew) return;
    setSavingNew(true);
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        setNewName('');
        setCreating(false);
        await loadProfiles();
      }
    } finally {
      setSavingNew(false);
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', margin: '2px 0 4px' }}>
      <button
        onClick={toggleOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8,
          padding: '7px 10px', cursor: 'pointer', fontFamily: 'var(--font)',
        }}
      >
        <span style={{ color: 'var(--text3)' }}><IconSwap /></span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeProfileName}
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30,
          background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 6,
        }}>
          {loading ? (
            <div style={{ padding: '10px 8px', fontSize: 12, color: 'var(--text3)' }}>Loading…</div>
          ) : (
            profiles.map(p => (
              <button
                key={p.id}
                onClick={() => switchTo(p.id)}
                disabled={switching === p.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6,
                  padding: '7px 8px', fontFamily: 'var(--font)', textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg3)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ width: 13, color: 'var(--teal)' }}>{p.is_active && <IconCheck />}</span>
                <span style={{ fontSize: 12.5, fontWeight: p.is_active ? 700 : 500, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{p.module_count}</span>
              </button>
            ))
          )}

          <div style={{ borderTop: '1px solid var(--border2)', marginTop: 4, paddingTop: 4 }}>
            {creating ? (
              <div style={{ display: 'flex', gap: 6, padding: '4px 4px 2px' }}>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createProfile()}
                  placeholder="Profile name"
                  maxLength={100}
                  style={{
                    flex: 1, fontSize: 12.5, padding: '6px 8px', borderRadius: 6,
                    border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'var(--font)',
                  }}
                />
                <button
                  onClick={createProfile}
                  disabled={savingNew || !newName.trim()}
                  className="btn-primary"
                  style={{ fontSize: 12, padding: '6px 10px' }}
                >
                  {savingNew ? '…' : 'Add'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6,
                  padding: '7px 8px', fontSize: 12.5, fontWeight: 600, color: 'var(--teal)', fontFamily: 'var(--font)',
                }}
              >
                + New profile
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function IconGrid() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="1" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8.5" y="1" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="1" y="8.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  );
}
export function IconBlocks() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M1.5 4.5h12M1.5 7.5h8M1.5 10.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <rect x="10" y="6.5" width="4.5" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  );
}
export function IconStar() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 1.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6L7.5 9.7l-3.2 1.7.6-3.6L2.3 5.3l3.6-.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  );
}
export function IconTarget() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="7.5" cy="7.5" r="3" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="7.5" cy="7.5" r="1" fill="currentColor"/>
    </svg>
  );
}
export function IconFiles() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M8 1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6L8 1Z" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 1v5h5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M5 9h5M5 11.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
export function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7.5 1v1.5M7.5 12.5V14M14 7.5h-1.5M2.5 7.5H1M12.3 2.7l-1.06 1.06M3.76 11.24 2.7 12.3M12.3 12.3l-1.06-1.06M3.76 3.76 2.7 2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
export function IconUpgrade() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 1.5l4.5 4.5H9V11H6V6H3l4.5-4.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M2 13h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
export function IconShield() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 1.5L2 4v4c0 3.2 2.3 5.8 5.5 6.5C10.7 13.8 13 11.2 13 8V4L7.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M5 7.5l2 2 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
export function IconResume() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M9 1H3.5A1.5 1.5 0 002 2.5v10A1.5 1.5 0 003.5 14h8A1.5 1.5 0 0013 12.5V5L9 1Z" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M5 8h5M5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
export function IconPerson() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M2 13c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
export function IconBriefcase2() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M5 5V3.5A1.5 1.5 0 0 1 6.5 2h2A1.5 1.5 0 0 1 10 3.5V5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M1 9h13" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6.5 9v.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
export function IconClipboard() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="3" y="2.5" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M5.5 2.5V2a1.5 1.5 0 0 1 1.5-1.5h1A1.5 1.5 0 0 1 9.5 2v.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M5.5 6.5h4M5.5 9h4M5.5 11.5h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
export function IconBuilding() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1.5" y="1.5" width="8" height="12" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="9.5" y="5.5" width="4" height="8" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M4 5h3M4 7.5h3M4 10h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
export default function AppSidebar({ footer, tier, isAdmin, activeProfileName, activeProfileId }: { footer?: React.ReactNode; tier?: string; isAdmin?: boolean; activeProfileName?: string; activeProfileId?: string }) {
  const pathname = usePathname();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: <IconGrid />, exact: true },
    { href: '/library', label: 'My Modules', icon: <IconBlocks />, exact: false },
    { href: '/generate', label: 'Generate', icon: <IconStar />, exact: false },
    { href: '/matches', label: 'Job Matches', icon: <IconTarget />, exact: false },
    { href: '/applications', label: 'Applications', icon: <IconFiles />, exact: false },
    { href: '/resumes', label: 'My Resumes', icon: <IconResume />, exact: false },
    { href: '/my-info', label: 'My Info', icon: <IconPerson />, exact: true },
    { href: '/job-tracker', label: 'Job Tracker', icon: <IconBriefcase2 />, exact: false },
    { href: '/interview-prep', label: 'Interview Prep', icon: <IconClipboard />, exact: false },
  ];

  function active(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  return (
    <aside className="app-sidebar">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 0 0' }}>
        <Link href="/dashboard" className="sidebar-logo">
          <ModuleHireLogo size="sidebar" />
        </Link>
        <ThemeToggle />
      </div>

      {activeProfileId && (
        <ProfileSwitcher activeProfileName={activeProfileName ?? 'Default'} activeProfileId={activeProfileId} />
      )}

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
        <Link href="/account" className={`nav-item${pathname === '/account' ? ' active' : ''}`}>
          <span className="nav-item-icon"><IconSettings /></span>
          Account
        </Link>
        {!isProTier(tier) && (
          <Link href="/billing" className={`nav-item${pathname === '/billing' ? ' active' : ''}`}>
            <span className="nav-item-icon"><IconUpgrade /></span>
            Upgrade
          </Link>
        )}
        {isAdmin && (
          <Link href="/admin" className={`nav-item${pathname.startsWith('/admin') ? ' active' : ''}`}>
            <span className="nav-item-icon"><IconShield /></span>
            Admin
          </Link>
        )}
        <Link href="/support" className={`nav-item${pathname.startsWith('/support') ? ' active' : ''}`}>
          <span className="nav-item-icon">?</span>
          Support
        </Link>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Switch context</div>
        <Link href="/business/dashboard" className="nav-item">
          <span className="nav-item-icon"><IconBuilding /></span>
          For Business
        </Link>
      </div>

      {footer}

      <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', padding: '10px 12px' }}>
        <button
          onClick={() => setFeedbackOpen(true)}
          className="nav-item"
          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '8px 10px' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1H2a1 1 0 00-1 1v7a1 1 0 001 1h2v2.5L7 10h5a1 1 0 001-1V2a1 1 0 00-1-1z"/>
          </svg>
          Share feedback
        </button>
      </div>

      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </aside>
  );
}
