function IconTarget() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.6" opacity="0.3"/>
      <circle cx="16" cy="16" r="8" stroke="currentColor" strokeWidth="1.6" opacity="0.6"/>
      <circle cx="16" cy="16" r="3" fill="currentColor"/>
    </svg>
  )
}

export default function Matches() {
  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Job Matches</span>
          <span className="topbar-sub">— Ranked by module fit</span>
        </div>
      </div>

      <div className="dash-content">
        <div className="section-card" style={{ maxWidth: 540 }}>
          <div style={{ padding: '48px 40px', textAlign: 'center' }}>
            <div style={{ color: 'var(--teal)', marginBottom: 18, display: 'flex', justifyContent: 'center' }}>
              <IconTarget />
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 10 }}>
              Job Matches — Coming Soon
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65, maxWidth: 380, margin: '0 auto' }}>
              We&apos;re building a feed of jobs matched to your top modules. Check back soon.
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
