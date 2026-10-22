import Link from 'next/link'

// Posting phrases generation left off because no module shows the candidate did them. Shown
// as a next action (write the module) rather than hidden or forced onto the resume.
export default function UnsupportedPhrases({ phrases }: { phrases: string[] }) {
  if (phrases.length === 0) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Not on your resume</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.45 }}>
        Because your library doesn&apos;t show it yet. If you&apos;ve done it, add a module and it can go on the next version.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {phrases.map(p => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
            <span style={{ color: 'var(--text2)', minWidth: 0, overflowWrap: 'anywhere' }}>{p}</span>
            <Link
              href={`/library/new?title=${encodeURIComponent(p)}`}
              style={{ color: 'var(--teal)', textDecoration: 'none', fontSize: 12, flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              Add a module
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
