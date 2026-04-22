import Link from 'next/link'

export default function ModuleMatching() {
  return (
    <>
      <div className="docs-breadcrumb">
        <Link href="/docs">Docs</Link>
        <span>›</span>
        <span>Generating Resumes</span>
        <span>›</span>
        <span style={{ color: 'var(--text2)' }}>Module matching</span>
      </div>
      <h1>Module matching</h1>
      <p className="docs-lead">Matching is the step that turns your library and a job description into a ranked stack. Here's how the scoring works and how to influence it.</p>

      <h2>How scoring works</h2>
      <p>The matching engine compares each module in your library against the extracted JD profile — themes, role type, seniority, and key phrases. Each module receives a match score from 0 to 100. The score reflects how well the module's tags and content align with what the role is looking for.</p>
      <p>Anchor modules always receive a score of 100 regardless of tag overlap — they're always in the stack. Strong modules are included when their score is 65 or higher. Supporting modules are included only at 80 or higher.</p>

      <h2>The recommended stack</h2>
      <p>After scoring, the engine selects a recommended stack of 6–10 modules ordered by relevance. This is what gets passed to the generation step by default. You can modify the stack before generating — add modules that were ranked out, remove ones that don't feel right for this application.</p>

      <div className="callout">
        <div className="callout-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="8" cy="8" r="6" /><path d="M8 5v3M8 11h.01" /></svg>
        </div>
        <div className="callout-text"><strong>Stack size matters.</strong> 6–8 modules tends to produce the best output resumes — enough depth to be compelling, not so much that the document becomes unfocused. If the recommended stack is larger than 8, consider removing the lowest-scoring modules manually.</div>
      </div>

      <h2>Improving match quality</h2>
      <p>If the matching results don't feel right — wrong modules surfacing, key ones being left out — the most effective fixes are:</p>
      <p><strong>Fix the module's tags.</strong> A module that's clearly relevant but scoring low is usually missing a theme or has the wrong role type. Open the module editor, add the relevant themes, and re-run matching.</p>
      <p><strong>Check the JD extraction.</strong> If the extracted themes don't match what the role is actually about, the scores will be off across the board. Go back to the JD review screen and correct the themes before re-running.</p>
      <p><strong>Adjust weight.</strong> If a module is consistently left out of stacks where it belongs, raise it from supporting to strong, or from strong to anchor.</p>

      <h2>Positioning variant</h2>
      <p>After reviewing the stack, you'll choose a positioning variant — A, B, or C. These correspond to different opening summary frames for the resume. Variant A leads with scope and scale. Variant B leads with methodology and approach. Variant C leads with domain expertise. Choose whichever angle best fits the specific role and company.</p>

      <div className="callout amber">
        <div className="callout-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 2L1 14h14L8 2zM8 7v3M8 12h.01" /></svg>
        </div>
        <div className="callout-text"><strong>No positioning module?</strong> If your library has no positioning modules, the variant selector has no effect and the resume opens directly with the first experience section. Add a positioning module to your library to unlock this feature.</div>
      </div>

      <h2>Re-running matching</h2>
      <p>You can re-run matching against a saved JD at any time from the generation history. This is useful when you've edited modules or updated tags after the initial run. The new stack may differ from the original — review it before generating.</p>

      <div className="docs-nav-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Link href="/docs/job-description-input" className="docs-nav-btn">
          <div className="docs-nav-label">← Previous</div>
          <div className="docs-nav-title">Job description input</div>
        </Link>
        <Link href="/docs/output-formats" className="docs-nav-btn">
          <div className="docs-nav-label">Next →</div>
          <div className="docs-nav-title">Output formats</div>
        </Link>
      </div>
    </>
  )
}
