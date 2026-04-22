import Link from 'next/link'

export default function TagsAndThemes() {
  return (
    <>
      <div className="docs-breadcrumb">
        <Link href="/docs">Docs</Link>
        <span>›</span>
        <span>The Module System</span>
        <span>›</span>
        <span style={{ color: 'var(--text2)' }}>Tags and themes</span>
      </div>
      <h1>Tags and themes</h1>
      <p className="docs-lead">Tags tell the matching engine what a module is about. Themes and role types are the vocabulary that connects your library to job descriptions.</p>

      <h2>How matching uses tags</h2>
      <p>When you paste a job description, the system extracts a set of themes and a role type from it. The matching engine then scores each module in your library by comparing its tags against the extracted JD profile. A module tagged with <span className="inline-code">developer-relations</span> and <span className="inline-code">community-building</span> will score highly against a Head of DevRel role; it will score lower against a Director of Community Marketing role.</p>

      <h2>Themes</h2>
      <p>Themes describe what the work was about. A module can have multiple themes. The current theme vocabulary covers the community, developer relations, and go-to-market space:</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, margin: '16px 0 24px' }}>
        {[
          'community-building','community-marketing','community-programs','community-ops',
          'community-health','ambassador-programs','member-lifecycle','retention',
          'engagement','developer-relations','developer-enablement','feedback-loops',
          'ai','technical-content','hackathons','product-collaboration',
          'product-advisory','cross-functional','data-driven','zero-to-one',
          'scale','growth','brand','content-strategy',
          'events','enablement','partnerships','lifecycle-marketing',
          'leadership','executive','consulting','startup',
        ].map(t => (
          <span key={t} className="inline-code" style={{ display: 'block', fontSize: 11 }}>{t}</span>
        ))}
      </div>

      <div className="callout">
        <div className="callout-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="8" cy="8" r="6" /><path d="M8 5v3M8 11h.01" /></svg>
        </div>
        <div className="callout-text">The AI assigns themes automatically on upload. Review them — the model occasionally misses a relevant theme or adds an irrelevant one. Fixing tags on key modules meaningfully improves match quality.</div>
      </div>

      <h2>Role types</h2>
      <p>Role types narrow matching to specific positions. A module tagged <span className="inline-code">vp-community</span> is weighted higher when the JD is a VP-level community role. Available role types:</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, margin: '16px 0 24px' }}>
        {[
          'vp-community','head-of-community','director-community','senior-manager-community',
          'community-manager','developer-relations','developer-advocacy',
          'developer-community-manager','community-marketing','community-ops',
          'community-enablement','content-strategy','ic-community',
        ].map(r => (
          <span key={r} className="inline-code" style={{ display: 'block', fontSize: 11 }}>{r}</span>
        ))}
      </div>

      <h2>Company stage</h2>
      <p>Each module can be tagged with one or more company stages: <span className="inline-code">startup</span>, <span className="inline-code">growth</span>, <span className="inline-code">enterprise</span>, or <span className="inline-code">any</span>. This helps surface stage-relevant experience — a hiring manager at a 20-person startup doesn't need to read about your enterprise procurement experience, and vice versa.</p>

      <h2>Editing tags</h2>
      <p>Open any module in the library editor. Themes, role types, and company stage are all editable as multi-select fields. Add or remove tags, then save. The change applies to future generations immediately — existing generated resumes are not affected.</p>

      <div className="docs-nav-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Link href="/docs/module-types" className="docs-nav-btn">
          <div className="docs-nav-label">← Previous</div>
          <div className="docs-nav-title">Module types</div>
        </Link>
        <Link href="/docs/editing-modules" className="docs-nav-btn">
          <div className="docs-nav-label">Next →</div>
          <div className="docs-nav-title">Editing modules</div>
        </Link>
      </div>
    </>
  )
}
