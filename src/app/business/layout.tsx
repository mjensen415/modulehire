import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BusinessSidebar from '@/components/business/BusinessSidebar'

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/signin')
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
