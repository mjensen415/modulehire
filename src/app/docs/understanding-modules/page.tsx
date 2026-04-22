import Link from 'next/link'

export default function UnderstandingModules() {
  return (
    <>
      <div className="docs-breadcrumb">
        <Link href="/docs">Docs</Link>
        <span>›</span>
        <span>Getting Started</span>
        <span>›</span>
        <span style={{ color: 'var(--text2)' }}>Understanding modules</span>
      </div>
      <h1>Understanding modules</h1>
      <p className="docs-lead">A module is a single skill domain from a single job, written as a self-contained paragraph. It's the core unit of everything ModuleHire does.</p>

      <h2>Why modules instead of a full resume?</h2>
      <p>A traditional resume forces you to commit to one story. If you apply for a community-focused role and a product-focused role on the same day, you're either writing two resumes from scratch or sending the wrong one. Modules solve this by separating your experience into its parts — so the right combination can be assembled for any role in seconds.</p>
      <p>Think of your module library as a content bank. Each module is a piece of writing about something you've actually done. When you apply to a job, the system selects the 6–10 pieces that best match the role and assembles them into a coherent document.</p>

      <h2>Anatomy of a module</h2>

      <div className="step-block">
        <div className="step-block-num" style={{ background: 'var(--teal)', color: 'var(--bg)' }}>T</div>
        <div className="step-block-body">
          <h3>Title</h3>
          <p>A short label for the skill domain — for example, <span className="inline-code">Community Building & Engagement</span> or <span className="inline-code">Developer Onboarding Programs</span>. This is used for display in your library and as a section heading in the output resume.</p>
        </div>
      </div>

      <div className="step-block">
        <div className="step-block-num" style={{ background: 'oklch(0.72 0.18 58)', color: 'var(--bg)' }}>C</div>
        <div className="step-block-body">
          <h3>Content</h3>
          <p>The body of the module — a paragraph or two describing the work you did in this specific domain, at this specific company. Written in first-person past tense. The output resume uses this content almost verbatim, with light rewording to match the JD's language.</p>
        </div>
      </div>

      <div className="step-block">
        <div className="step-block-num" style={{ background: 'oklch(0.62 0.18 270)', color: 'var(--bg)' }}>M</div>
        <div className="step-block-body">
          <h3>Metadata</h3>
          <p>Each module carries a source company, job title, date range, employment type, weight, type, and a set of tags. This metadata powers the matching engine — it's what lets the system know a module is relevant to a VP-level community role at a growth-stage company, for example.</p>
        </div>
      </div>

      <h2>Module weight</h2>
      <p>Weight determines how the matching engine treats a module:</p>
      <p><strong>Anchor</strong> — Always included in the stack regardless of match score. Use this for your most important, defining experience. Most resumes should have one or two anchors.</p>
      <p><strong>Strong</strong> — Included when its match score is 65 or higher. This covers the core competencies you want on most applications.</p>
      <p><strong>Supporting</strong> — Included only when its match score is 80 or higher. These are specialist modules that are highly relevant to some roles and irrelevant to others.</p>

      <div className="callout">
        <div className="callout-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="8" cy="8" r="6" /><path d="M8 5v3M8 11h.01" /></svg>
        </div>
        <div className="callout-text"><strong>Tip:</strong> Start with 1–2 anchor modules (your most career-defining work), 4–6 strong modules (your consistent competencies), and as many supporting modules as your experience warrants. You can always adjust weights later.</div>
      </div>

      <h2>Your module library over time</h2>
      <p>The library grows as you upload more resumes or add modules manually. Older modules stay in the library indefinitely — they won't appear in generated resumes unless the matching engine selects them. As your career evolves, you can update content, adjust weights, or archive modules you no longer want included.</p>

      <div className="docs-nav-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Link href="/docs/upload-resume" className="docs-nav-btn">
          <div className="docs-nav-label">← Previous</div>
          <div className="docs-nav-title">Upload your first resume</div>
        </Link>
        <Link href="/docs/module-types" className="docs-nav-btn">
          <div className="docs-nav-label">Next →</div>
          <div className="docs-nav-title">Module types</div>
        </Link>
      </div>
    </>
  )
}
