import type { Metadata } from 'next'
import Link from 'next/link'
import DemoWorkspace from './DemoWorkspace'
import { DEMO_JOB } from './demo-data'

export const metadata: Metadata = {
  title: 'Live demo',
  description:
    'See how ModuleHire for Business scores and ranks applicants against your criteria, with quoted evidence for every score. Sample data, no account needed.',
  alternates: { canonical: '/business/demo' },
}

// Public, static demo. Middleware lets /business/demo through without a session.
export default function BusinessDemoPage() {
  return (
    <div style={{ fontFamily: 'var(--font)', maxWidth: 1180, margin: '0 auto', padding: '28px 24px 64px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        background: 'var(--teal-dim)', border: '1px solid var(--teal-glow)', borderRadius: 12,
        padding: '12px 16px', marginBottom: 28,
      }}>
        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
          <strong>This is a demo with sample data.</strong>{' '}
          <span style={{ color: 'var(--text2)' }}>The candidates and company are made up. Click any applicant to see how each score was reached.</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/business" style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text2)', textDecoration: 'none',
            padding: '7px 12px', border: '1px solid var(--border2)', borderRadius: 7,
          }}>
            ← Overview
          </Link>
          <Link href="/signin?signup=1&next=/business" style={{
            fontSize: 13, fontWeight: 700, color: 'var(--on-teal)', textDecoration: 'none',
            padding: '8px 14px', background: 'var(--teal)', borderRadius: 7,
          }}>
            Try it with your own job →
          </Link>
        </div>
      </div>

      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
          Job posting
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', margin: 0 }}>
          {DEMO_JOB.title}
        </h1>
        <div style={{ fontSize: 13.5, color: 'var(--text3)', marginTop: 4 }}>
          {DEMO_JOB.company} · {DEMO_JOB.location}
        </div>
      </div>

      <DemoWorkspace />
    </div>
  )
}
