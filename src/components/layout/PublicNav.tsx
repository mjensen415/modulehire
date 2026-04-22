import Link from 'next/link'

export default function PublicNav() {
  return (
    <nav>
      <Link href="/" className="nav-logo">
        <div className="nav-logo-mark">MH</div>
        ModuleHire Labs
      </Link>
      <ul className="nav-links">
        <li><Link href="/how-it-works">How it works</Link></li>
        <li><Link href="/modules">Modules</Link></li>
        <li><Link href="/pricing">Pricing</Link></li>
        <li><Link href="/docs">FAQs/Docs</Link></li>
      </ul>
      <div className="nav-cta">
        <Link href="/signin" className="btn-ghost-sm">Sign in</Link>
        <Link href="/signin" className="btn-primary-sm">Get started free</Link>
      </div>
    </nav>
  )
}
