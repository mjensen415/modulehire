import Link from 'next/link'

export default function UploadResume() {
  return (
    <>
      <div className="docs-breadcrumb">
        <Link href="/docs">Docs</Link>
        <span>›</span>
        <span>Getting Started</span>
        <span>›</span>
        <span style={{ color: 'var(--text2)' }}>Upload your first resume</span>
      </div>
      <h1>Upload your first resume</h1>
      <p className="docs-lead">ModuleHire Labs parses your resume into reusable skill modules. The better your source file, the richer your module library.</p>

      <h2>Supported formats</h2>
      <p>The upload zone accepts PDF, DOCX, TXT, and RTF files up to 10MB. PDFs work best when they contain selectable text — scanned or image-only PDFs will produce poor results. DOCX files from Word or Google Docs export cleanly in almost all cases.</p>

      <div className="callout">
        <div className="callout-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="8" cy="8" r="6" /><path d="M8 5v3M8 11h.01" /></svg>
        </div>
        <div className="callout-text"><strong>Best results:</strong> Upload the version of your resume that's most complete — the one you've added to over the years rather than the one trimmed for a specific job. The parser extracts every skill domain it can find, so more source material means a richer library.</div>
      </div>

      <h2>What happens during parsing</h2>

      <div className="step-block">
        <div className="step-block-num">1</div>
        <div className="step-block-body">
          <h3>Text extraction</h3>
          <p>The raw text is extracted from your file and stored as a baseline. This is what the AI reads — no layout, no formatting, just content. This step is instant.</p>
        </div>
      </div>

      <div className="step-block">
        <div className="step-block-num">2</div>
        <div className="step-block-body">
          <h3>Module decomposition</h3>
          <p>The AI reads your resume and identifies every distinct skill domain within each role. A four-year job might produce six or eight modules — one for team leadership, one for technical writing, one for event operations, and so on. This step typically takes 15–45 seconds.</p>
        </div>
      </div>

      <div className="step-block">
        <div className="step-block-num">3</div>
        <div className="step-block-body">
          <h3>Tagging and classification</h3>
          <p>Each module is automatically tagged with a type (experience, skill, story, or positioning), a weight (anchor, strong, or supporting), and a set of themes used during matching. You can review and adjust all of these in the module editor.</p>
        </div>
      </div>

      <h2>Uploading multiple resumes</h2>
      <p>Each upload adds to your library — it does not replace previous modules. This is intentional. If you have a resume focused on community work and another focused on product management, upload both. The module system will consolidate them into a single searchable library, and the matching engine will select the right ones for each job.</p>

      <div className="callout amber">
        <div className="callout-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 2L1 14h14L8 2zM8 7v3M8 12h.01" /></svg>
        </div>
        <div className="callout-text"><strong>Duplicate content:</strong> If two resumes describe the same job, you may end up with duplicate modules. After uploading, review your library and delete or merge any redundant entries.</div>
      </div>

      <h2>After upload</h2>
      <p>Once parsing completes, you'll land on the module review screen. Every module is marked <span className="inline-code">needs-review</span> by default. Work through them, edit the content where the AI missed something, and mark each one as approved. You don't have to review everything before generating — the system will use whatever's in your library.</p>

      <div className="docs-nav-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Link href="/docs" className="docs-nav-btn">
          <div className="docs-nav-label">← Previous</div>
          <div className="docs-nav-title">Quick start</div>
        </Link>
        <Link href="/docs/understanding-modules" className="docs-nav-btn">
          <div className="docs-nav-label">Next →</div>
          <div className="docs-nav-title">Understanding modules</div>
        </Link>
      </div>
    </>
  )
}
