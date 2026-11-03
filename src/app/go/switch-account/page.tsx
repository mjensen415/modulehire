// Shown when an MCP editor link (/go/[token]) was opened in a browser signed in to a different
// ModuleHire account than the one the AI app is connected to.
import Link from 'next/link'
import { isUuid } from '@/lib/validate'

export const metadata = {
  title: 'Different account | ModuleHire',
  robots: { index: false },
}

export default async function SwitchAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string | string[] }>
}) {
  const raw = (await searchParams).resume
  const resumeId = typeof raw === 'string' && isUuid(raw) ? raw : null
  const signinNext = resumeId ? `/signin?next=${encodeURIComponent(`/resumes/${resumeId}`)}` : '/signin'

  return (
    <>
      <nav>
        <Link href="/" className="nav-logo">
          <div className="nav-logo-mark">MH</div>
          ModuleHire Labs
        </Link>
      </nav>
      <section className="auth-page">
        <div className="auth-bg" />
        <div className="auth-card">
          <div className="card-logo">
            <div className="card-logo-mark">MH</div>
          </div>
          <h1 className="auth-headline">You&apos;re signed in to a different account</h1>
          <p className="auth-sub" style={{ marginBottom: 20 }}>
            This resume belongs to the ModuleHire account connected to your AI app. Sign out here, then sign in with that
            account to open it.
          </p>
          <form action={`/auth/signout?next=${encodeURIComponent(signinNext)}`} method="post">
            <button type="submit" className="btn-primary-full">
              Sign out and switch accounts
            </button>
          </form>
          <p className="auth-legal" style={{ marginTop: 16 }}>
            <Link href="/dashboard">Stay in this account</Link>
          </p>
        </div>
      </section>
    </>
  )
}
