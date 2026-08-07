import { createClient } from '@/lib/supabase/server'
import BusinessSidebar from '@/components/business/BusinessSidebar'

// This layout wraps all /business routes. Auth protection for /business/* subpaths
// is handled at the middleware level (proxy.ts → middleware.ts PROTECTED_PREFIXES).
// The exact /business path is the public landing page and is exempt from the
// middleware redirect — logged-out users land here, logged-in users are redirected
// to their dashboard by business/page.tsx.
export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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
