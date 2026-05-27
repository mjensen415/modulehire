import Link from 'next/link'
import ThemeToggle from '@/components/ThemeToggle'
import ModuleHireLogo from '@/components/ModuleHireLogo'

export default function PublicNav() {
  return (
    <nav>
      <Link href="/" className="nav-logo">
        <ModuleHireLogo size="nav" />
      </Link>
      <ul className="nav-links">
        <li><Link href="/how-it-works">How it works</Link></li>
        <li><Link href="/modules">Modules</Link></li>
        <li><Link href="/pricing">Pricing</Link></li>
        <li><Link href="/docs">FAQs/Docs</Link></li>
        <li><Link href="/support">Support</Link></li>
      </ul>
      <div className="nav-cta">
        <ThemeToggle />
        <Link href="/signin" className="btn-ghost-sm">Sign in</Link>
        <Link href="/signin?signup=1" className="btn-primary-sm">Start free</Link>
      </div>
    </nav>
  )
}
