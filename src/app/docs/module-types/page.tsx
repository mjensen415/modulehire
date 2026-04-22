import Link from 'next/link'

export default function ModuleTypes() {
  return (
    <>
      <div className="docs-breadcrumb">
        <Link href="/docs">Docs</Link>
        <span>›</span>
        <span>The Module System</span>
        <span>›</span>
        <span style={{ color: 'var(--text2)' }}>Module types</span>
      </div>
      <h1>Module types</h1>
      <p className="docs-lead">Every module has a type that determines how it's used in the output resume. There are four types: experience, skill, story, and positioning.</p>

      <h2>Experience</h2>
      <p>The most common type. An experience module describes work you did within a specific skill domain at a specific company — what you built, ran, grew, or fixed. It reads as professional history and appears in the experience section of the generated resume.</p>
      <p>Example title: <span className="inline-code">Ambassador Program Development</span> at Acme Corp, 2021–2023.</p>

      <div className="callout">
        <div className="callout-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="8" cy="8" r="6" /><path d="M8 5v3M8 11h.01" /></svg>
        </div>
        <div className="callout-text">Most of the modules generated from a resume upload will be of type <strong>experience</strong>. The AI defaults to this unless the content clearly fits another type.</div>
      </div>

      <h2>Skill</h2>
      <p>A skill module describes a capability rather than a job history entry. It's not tied to a specific company or date range — it captures something you're genuinely expert in across multiple contexts. Skills appear in a dedicated skills section in the output resume.</p>
      <p>Example title: <span className="inline-code">Community Platform Operations</span> — covering your approach to tooling, vendor management, and platform strategy regardless of which company you were at.</p>

      <h2>Story</h2>
      <p>A story module is a high-impact narrative about a specific outcome — a turnaround, a zero-to-one launch, a crisis managed well. It's more qualitative than an experience module and is written to demonstrate judgment and impact rather than list responsibilities.</p>
      <p>Story modules are especially useful for senior roles where the hiring manager wants to understand how you think and operate, not just what your job description was. They appear inline with experience, typically after the relevant experience module for the same company.</p>

      <h2>Positioning</h2>
      <p>A positioning module is your opening statement — the summary paragraph that appears at the top of the resume. Unlike the other types, you typically have just one or two of these, each representing a different career narrative angle.</p>
      <p>Example: one positioning module framing you as a community builder who bridges technical and non-technical audiences; another framing you as a go-to-market operator who uses community as a growth channel. The matching engine selects whichever positioning best fits the role.</p>

      <div className="callout amber">
        <div className="callout-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 2L1 14h14L8 2zM8 7v3M8 12h.01" /></svg>
        </div>
        <div className="callout-text"><strong>Positioning modules and weight:</strong> Set your positioning modules as <strong>anchor</strong> weight if you always want one included, or <strong>strong</strong> if you want the engine to choose one only when it's a good fit. Having zero positioning modules is fine — the resume will open with your first experience section instead.</div>
      </div>

      <h2>Changing a module's type</h2>
      <p>Open any module in the library editor and use the Type dropdown. Changes take effect on the next generation. The module's content doesn't change — only how the output resume handles its placement.</p>

      <div className="docs-nav-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Link href="/docs/understanding-modules" className="docs-nav-btn">
          <div className="docs-nav-label">← Previous</div>
          <div className="docs-nav-title">Understanding modules</div>
        </Link>
        <Link href="/docs/tags-and-themes" className="docs-nav-btn">
          <div className="docs-nav-label">Next →</div>
          <div className="docs-nav-title">Tags and themes</div>
        </Link>
      </div>
    </>
  )
}
