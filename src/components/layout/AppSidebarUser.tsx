import { createClient } from '@/lib/supabase/server'

function IconChevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: 'var(--text3)', flexShrink: 0 }}>
      <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default async function AppSidebarUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const name = user?.user_metadata?.full_name ?? user?.email ?? 'User'
  const initials = name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="sidebar-footer">
      <div className="user-row">
        <div className="user-avatar">{initials}</div>
        <div className="user-info">
          <div className="user-name">{name}</div>
          <div className="user-plan">Pro plan</div>
        </div>
        <IconChevron />
      </div>
    </div>
  )
}
