import { createClient } from '@/lib/supabase/server'
import BusinessSidebar from '@/components/business/BusinessSidebar'

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Unauthenticated users reach the landing page (/business) — no sidebar, no redirect.
  // Individual authed pages (dashboard, jobs, settings) handle their own auth checks.
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        {children}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <BusinessSidebar userEmail={user.email ?? null} />
      <main style={{ flex: 1, marginLeft: 220, padding: 40 }}>
        {children}
      </main>
    </div>
  )
}
