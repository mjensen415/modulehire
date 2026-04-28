import Link from 'next/link'
import PublicNav from '@/components/layout/PublicNav'
import PublicFooter from '@/components/layout/PublicFooter'
import { createClient } from '@/lib/supabase/server'

export default async function NotFound() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const homePath = user ? '/dashboard' : '/'
  const homeLabel = user ? 'Back to dashboard' : 'Back to home'

  return (
    <>
      <PublicNav />

      <section className="page-hero">
        <div className="hero-glow"></div>
        <div className="eyebrow">404</div>
        <h1 className="page-headline">Page not found</h1>
        <p className="page-sub">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>

        <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link href={homePath} className="btn-primary" style={{ textDecoration: 'none' }}>
            {homeLabel} →
          </Link>
          <Link href="/how-it-works" className="btn-secondary" style={{ textDecoration: 'none' }}>
            How it works
          </Link>
        </div>
      </section>

      <PublicFooter />
    </>
  )
}
