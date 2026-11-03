// OAuth consent screen for Supabase Auth's OAuth 2.1 server (the "Authorization Path" in the
// Supabase dashboard). AI clients such as Claude send the user here with ?authorization_id=...
// to approve access to their ModuleHire account; the tokens they get back are what /api/mcp
// accepts. Signed-out users go through /signin and come back with the same authorization_id.
import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ConsentActions from './ConsentActions'

export const metadata = {
  title: 'Connect an app | ModuleHire',
  robots: { index: false },
}

const ACCESS = [
  'See your skill modules, work history, target jobs, resumes, and job applications',
  'Edit your resumes, add skill modules to your library, and update your job tracker',
  "Generate tailored resumes, which count toward your plan's monthly limit",
]

function hostOf(uri: string): string | null {
  try {
    return new URL(uri).host
  } catch {
    return null
  }
}

function Shell({ children }: { children: ReactNode }) {
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
          {children}
        </div>
      </section>
    </>
  )
}

function Problem({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <h1 className="auth-headline">{title}</h1>
      <p className="auth-sub" style={{ marginBottom: 20 }}>{body}</p>
      <Link href="/dashboard" className="btn-primary-full" style={{ textAlign: 'center', textDecoration: 'none' }}>
        Go to ModuleHire
      </Link>
    </Shell>
  )
}

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string | string[] }>
}) {
  const raw = (await searchParams).authorization_id
  const authorizationId = typeof raw === 'string' ? raw : null
  if (!authorizationId) {
    return <Problem title="Nothing to approve" body="This link is missing its request. Start connecting ModuleHire again from your AI app." />
  }

  const here = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/signin?next=${encodeURIComponent(here)}`)

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
  if (error || !data) {
    return (
      <Problem
        title="This request has expired"
        body="Connection requests only last a few minutes. Go back to your AI app and connect ModuleHire again."
      />
    )
  }
  // Already approved for this client and these scopes: Supabase hands back the callback URL.
  if (!('authorization_id' in data)) redirect(data.redirect_url)

  const clientName = data.client.name?.trim() || 'An app'
  const returnHost = hostOf(data.redirect_uri)

  return (
    <Shell>
      <h1 className="auth-headline">Connect {clientName} to ModuleHire</h1>
      <p className="auth-sub" style={{ marginBottom: 22 }}>
        {clientName} is asking to use your ModuleHire account.
      </p>

      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
        If you allow it, {clientName} can:
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'grid', gap: 10 }}>
        {ACCESS.map((line) => (
          <li key={line} style={{ display: 'flex', gap: 10, fontSize: 13.5, lineHeight: 1.5, color: 'var(--text2)' }}>
            <span aria-hidden style={{ color: 'var(--teal)', fontWeight: 800 }}>✓</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text3)', marginBottom: 18 }}>
        It acts as you, only when you ask it to use a ModuleHire tool. It never sees your password.
      </p>

      <div
        style={{
          border: '1px solid var(--border2)',
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 22,
          fontSize: 13,
          lineHeight: 1.55,
          color: 'var(--text2)',
        }}
      >
        <div>
          Signed in as <strong style={{ color: 'var(--text)' }}>{user.email}</strong>
        </div>
        {returnHost && (
          <div style={{ marginTop: 6 }}>
            You will be sent back to{' '}
            <strong style={{ color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12.5 }}>{returnHost}</strong>
          </div>
        )}
      </div>

      <ConsentActions authorizationId={data.authorization_id} clientName={clientName} />

      <form action={`/auth/signout?next=${encodeURIComponent(`/signin?next=${encodeURIComponent(here)}`)}`} method="post">
        <p className="auth-legal" style={{ marginTop: 16 }}>
          Not you?{' '}
          <button
            type="submit"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--text3)',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            Use a different account
          </button>
          {' · '}
          <Link href="/privacy">Privacy</Link>
        </p>
      </form>
    </Shell>
  )
}
