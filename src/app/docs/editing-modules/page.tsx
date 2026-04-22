import Link from 'next/link'

export default function EditingModules() {
  return (
    <>
      <div className="docs-breadcrumb">
        <Link href="/docs">Docs</Link>
        <span>›</span>
        <span>The Module System</span>
        <span>›</span>
        <span style={{ color: 'var(--text2)' }}>Editing modules</span>
      </div>
      <h1>Editing modules</h1>
      <p className="docs-lead">The AI does a first pass, but your library is only as good as the editing you put into it. This is where you take ownership of your narrative.</p>

      <h2>Opening the module editor</h2>
      <p>From your library, click any module to open it in the editor panel. You can edit the title, content, type, weight, and all tags from here. Changes save automatically when you navigate away or explicitly click <strong>Save</strong>.</p>

      <h2>Editing content</h2>
      <p>The content field is a plain text editor. Rewrite freely — the goal is prose that is accurate, specific, and strong. A few principles that make module content work well in generated resumes:</p>
      <p><strong>Be specific about scale.</strong> "Grew a community of 50,000 members" is stronger than "grew a large community." Numbers don't need to be exact — approximate is fine.</p>
      <p><strong>Lead with impact.</strong> Open with what changed or what was built, then explain how. The first sentence often ends up as the section opener in the generated resume, so make it count.</p>
      <p><strong>Cut the preamble.</strong> Don't start with "In my role as..." or "I was responsible for..." — go straight to the work. The resume template handles context like company name and title separately.</p>

      <div className="callout">
        <div className="callout-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="8" cy="8" r="6" /><path d="M8 5v3M8 11h.01" /></svg>
        </div>
        <div className="callout-text"><strong>Length guide:</strong> Most modules work best at 60–120 words. Short enough to be skimmed, long enough to show depth. Positioning modules can run a little longer — up to 150 words.</div>
      </div>

      <h2>Splitting a module</h2>
      <p>If the AI bundled two distinct skill domains into one module, split it. Open the module, copy the content, then use <strong>Duplicate</strong> to create a second copy. Edit each copy to isolate its own domain, retitle them, and update the tags. Delete the original.</p>
      <p>Splitting is worth doing when you have one module that covers both a technical skill and a leadership skill — they'll match very differently against job descriptions.</p>

      <h2>Merging modules</h2>
      <p>If two modules cover the same domain and are redundant, merge them manually. Copy the best content from both into one module, delete the duplicate. There's no automated merge — it's intentionally a manual step so you control the output.</p>

      <h2>Adjusting weight</h2>
      <p>Weight is the most impactful thing you can change. If a module keeps getting left out of stacks where you'd expect it, raise its weight. If it's appearing in stacks where it doesn't belong, lower it or tighten its tags.</p>

      <div className="callout amber">
        <div className="callout-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 2L1 14h14L8 2zM8 7v3M8 12h.01" /></svg>
        </div>
        <div className="callout-text"><strong>Don't over-anchor.</strong> If everything is an anchor, nothing is — every module appears in every resume regardless of relevance. Reserve anchor weight for one or two modules that truly define your career at this moment.</div>
      </div>

      <h2>Deleting modules</h2>
      <p>Deleted modules are soft-deleted — they won't appear in new generations but remain in the database for 30 days before permanent removal. If you delete something by mistake, contact support and we can restore it within that window.</p>

      <div className="docs-nav-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Link href="/docs/tags-and-themes" className="docs-nav-btn">
          <div className="docs-nav-label">← Previous</div>
          <div className="docs-nav-title">Tags and themes</div>
        </Link>
        <Link href="/docs/job-description-input" className="docs-nav-btn">
          <div className="docs-nav-label">Next →</div>
          <div className="docs-nav-title">Job description input</div>
        </Link>
      </div>
    </>
  )
}
