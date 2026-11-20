import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import BusinessSidebar from '@/components/business/BusinessSidebar'
import '@/app/warm.css'
import './business.css'

const DESCRIPTION =
  'Paste a job description, upload applicants, and get every resume scored 0 to 100 against your criteria, with quoted evidence for each score.'

export const metadata: Metadata = {
  metadataBase: new URL('https://business.modulehire.com'),
  title: {
    default: 'ModuleHire for Business: AI applicant screening',
    template: '%s · ModuleHire for Business',
  },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'ModuleHire for Business',
    title: 'ModuleHire for Business: AI applicant screening',
    description: DESCRIPTION,
    url: 'https://business.modulehire.com',
  },
  twitter: {
    card: 'summary',
    title: 'ModuleHire for Business: AI applicant screening',
    description: DESCRIPTION,
  },
}

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
    <div className="warm biz-shell">
      <BusinessSidebar userEmail={user.email ?? null} />
      <main className="biz-main">
        {children}
      </main>
    </div>
  )
}
