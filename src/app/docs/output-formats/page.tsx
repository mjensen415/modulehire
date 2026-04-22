import Link from 'next/link'

export default function OutputFormats() {
  return (
    <>
      <div className="docs-breadcrumb">
        <Link href="/docs">Docs</Link>
        <span>›</span>
        <span>Generating Resumes</span>
        <span>›</span>
        <span style={{ color: 'var(--text2)' }}>Output formats</span>
      </div>
      <h1>Output formats</h1>
      <p className="docs-lead">Every generation produces a DOCX and a PDF simultaneously. Both are available for download immediately after generation completes.</p>

      <h2>DOCX</h2>
      <p>The Word document is the editable version. Use this when you want to make manual adjustments before sending — tweak a sentence, move a section, add your contact details if they weren't parsed correctly. The DOCX is formatted with heading styles so it's easy to navigate and modify in Word or Google Docs.</p>
      <p>The DOCX uses clean, ATS-friendly formatting: standard fonts, no tables, no text boxes, no headers/footers. Most applicant tracking systems parse it without issues.</p>

      <h2>PDF</h2>
      <p>The PDF is the submission-ready version. Use this when applying through an online portal that accepts PDF uploads, or when sending directly to a recruiter. The layout is fixed and renders consistently across devices.</p>

      <div className="callout">
        <div className="callout-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="8" cy="8" r="6" /><path d="M8 5v3M8 11h.01" /></svg>
        </div>
        <div className="callout-text"><strong>Which to use?</strong> When in doubt, use the DOCX — edit it in Google Docs, export to PDF yourself once you're satisfied. This gives you a final review pass before it goes out.</div>
      </div>

      <h2>What's included in the output</h2>
      <p>The generated resume contains:</p>
      <p><strong>Header</strong> — Your name, current or most recent job title, and contact information pulled from the source resume. Review this — the parser sometimes misses email or phone if they were formatted unusually.</p>
      <p><strong>Summary</strong> — If a positioning module was included in the stack, it appears here as a 2–3 sentence opening. Otherwise this section is omitted.</p>
      <p><strong>Experience sections</strong> — One section per module, ordered by match score. Each section includes the module title as a heading, followed by the module content. The source company and dates appear as a subheading.</p>
      <p><strong>Skills section</strong> — Populated from any skill-type modules in the stack.</p>
      <p><strong>Education</strong> — Included if the source resume contained education information that was parsed into a module.</p>

      <h2>Download links and expiration</h2>
      <p>On the free plan, download links are valid for 24 hours. After that, the files are deleted from storage and the links expire. If you need to download again after 24 hours, you'll need to regenerate.</p>

      <div className="callout amber">
        <div className="callout-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 2L1 14h14L8 2zM8 7v3M8 12h.01" /></svg>
        </div>
        <div className="callout-text"><strong>Save a copy locally.</strong> Download both files when you generate and save them with a descriptive name (e.g. <span className="inline-code">acme-director-community-2026-04.docx</span>) before the links expire. Free plan storage is intentionally temporary.</div>
      </div>

      <h2>Pro plan storage</h2>
      <p>Pro plan users get permanent storage for all generated resumes. Download links don't expire, and all previous generations remain accessible from the generation history screen. Coming in Phase 2.</p>

      <div className="note-box">
        <div className="note-label">Coming soon</div>
        <div className="note-text">A live preview of the generated resume before download — see exactly how the output will look before committing to it. Also: custom resume templates so you can apply your own visual style to the generated content.</div>
      </div>

      <div className="docs-nav-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Link href="/docs/module-matching" className="docs-nav-btn">
          <div className="docs-nav-label">← Previous</div>
          <div className="docs-nav-title">Module matching</div>
        </Link>
        <Link href="/docs" className="docs-nav-btn">
          <div className="docs-nav-label">↑ Back to top</div>
          <div className="docs-nav-title">Quick start</div>
        </Link>
      </div>
    </>
  )
}
