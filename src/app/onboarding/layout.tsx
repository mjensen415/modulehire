import Link from 'next/link'
import ModuleHireLogo from '@/components/ModuleHireLogo'

export const metadata = {
  title: 'Get started — ModuleHire',
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 32px', borderBottom: '1px solid var(--border)',
      }}>
        <Link href="/" aria-label="ModuleHire home">
          <ModuleHireLogo size="nav" />
        </Link>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          Need help? <a href="mailto:info@modulehire.com" style={{ color: 'var(--text2)' }}>info@modulehire.com</a>
        </div>
      </header>
      <main style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 720 }}>{children}</div>
      </main>
    </div>
  )
}
