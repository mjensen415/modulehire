import Link from 'next/link'
import ThemeToggle from '@/components/ThemeToggle'

export default function PublicNav() {
  return (
    <nav>
      <Link href="/" className="nav-logo">
        <div className="nav-logo-mark">MH</div>
        ModuleHire Labs
        <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400, marginLeft: 2 }}>Beta</span>
      </Link>
      <ul className="nav-links">
        <li><Link href="/how-it-works">How it works</Link></li>
        <li><Link href="/modules">Modules</Link></li>
        <li><Link href="/pricing">Pricing</Link></li>
        <li><Link href="/docs">FAQs/Docs</Link></li>
      </ul>
      <div className="nav-cta">
        <ThemeToggle />
        <Link href="/signin" className="btn-ghost-sm">Sign in</Link>
        <Link href="/request-access" className="btn-primary-sm">Request beta access</Link>
      </div>
    </nav>
  )
}
