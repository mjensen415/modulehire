import Link from 'next/link'

export default function Docs() {
  return (
    <>
      <div className="docs-breadcrumb">
        <Link href="/docs">Docs</Link>
        <span>›</span>
        <span>Getting Started</span>
        <span>›</span>
        <span style={{ color: 'var(--text2)' }}>Quick start</span>
      </div>
      <h1>Quick start</h1>
      <p className="docs-lead">Get from zero to your first tailored resume in under five minutes. This guide walks through every step from upload to download.</p>

      <div className="step-block">
        <div className="step-block-num">1</div>
        <div className="step-block-body">
          <h3>Upload your resume</h3>
          <p>Go to <span className="inline-code">Upload</span> and drag your resume into the upload zone, or click <strong>Browse files</strong>. Supported formats: PDF, DOCX, TXT, RTF. Max file size is 10MB. Processing takes 5–15 seconds depending on resume length.</p>
        </div>
      </div>

      <div className="callout">
        <div className="callout-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="8" cy="8" r="6" /><path d="M8 5v3M8 11h.01" /></svg>
        </div>
        <div className="callout-text"><strong>Tip:</strong> Upload your most comprehensive resume first — the one that covers the most ground. Additional uploads add to your library, not replace it.</div>
      </div>

      <div className="step-block">
        <div className="step-block-num">2</div>
        <div className="step-block-body">
          <h3>Review your modules</h3>
          <p>After parsing, you'll see your modules grouped by source job. Each module has a domain label, content, and source tag. Review each one — edit, split, or merge as needed. Click <strong>Save library →</strong> when you're satisfied.</p>
        </div>
      </div>

      <div className="step-block">
        <div className="step-block-num">3</div>
        <div className="step-block-body">
          <h3>Input a job description</h3>
          <p>Navigate to <span className="inline-code">Generate</span> in the sidebar. Paste the job description text, or use the URL tab to fetch it directly. The system extracts the role title, company, seniority, and top themes automatically.</p>
        </div>
      </div>

      <div className="step-block">
        <div className="step-block-num">4</div>
        <div className="step-block-body">
          <h3>Review module selection</h3>
          <p>The module selection screen shows your library ranked by match score. Toggle modules in or out of the stack. Choose a positioning variant that fits the role, and lock any anchor modules you always want included.</p>
        </div>
      </div>

      <div className="step-block">
        <div className="step-block-num">5</div>
        <div className="step-block-body">
          <h3>Download your resume</h3>
          <p>Preview the generated resume on the right side of the screen. Edit the title if needed, then click <strong>Download DOCX</strong> or <strong>Download PDF</strong>. Both formats are generated in parallel — grab whichever your application needs.</p>
        </div>
      </div>

      <div className="callout amber">
        <div className="callout-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 2L1 14h14L8 2zM8 7v3M8 12h.01" /></svg>
        </div>
        <div className="callout-text"><strong>Free plan note:</strong> Generated resume download links expire after 24 hours. Upgrade to Pro for permanent storage.</div>
      </div>

      <h2>What gets generated</h2>
      <p>The output resume includes a header with your name and contact info (pulled from the source resume), followed by sections for each selected module. Sections are ordered by match score — highest-scoring modules appear first.</p>
      <p>The positioning module (if selected) sets the opening summary paragraph. Without one, the resume opens directly with experience.</p>

      <div className="note-box">
        <div className="note-label">Coming soon</div>
        <div className="note-text">API access for programmatic resume generation — define module sets, pass a JD, and receive formatted output via POST request. Join the waitlist at <span className="inline-code">/api</span>.</div>
      </div>

      <div className="docs-nav-footer">
        <Link href="/docs/upload-resume" className="docs-nav-btn">
          <div className="docs-nav-label">Next →</div>
          <div className="docs-nav-title">Upload your first resume</div>
        </Link>
      </div>
    </>
  )
}
