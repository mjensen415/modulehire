import Link from 'next/link'

export default function JobDescriptionInput() {
  return (
    <>
      <div className="docs-breadcrumb">
        <Link href="/docs">Docs</Link>
        <span>›</span>
        <span>Generating Resumes</span>
        <span>›</span>
        <span style={{ color: 'var(--text2)' }}>Job description input</span>
      </div>
      <h1>Job description input</h1>
      <p className="docs-lead">The job description is the other half of the equation. What you give it here determines which modules get selected and how the output resume is framed.</p>

      <h2>Paste vs. URL</h2>
      <p>The input screen has two tabs: <strong>Paste</strong> and <strong>URL</strong>. Paste is always available — copy the job description from wherever you found it and drop it in. The URL tab fetches the page content directly, which is faster if you're working from a job board link.</p>

      <div className="callout">
        <div className="callout-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="8" cy="8" r="6" /><path d="M8 5v3M8 11h.01" /></svg>
        </div>
        <div className="callout-text"><strong>More is better.</strong> Include the full JD — responsibilities, qualifications, the company blurb, all of it. The more text the system has, the more accurately it can extract themes and phrases. Don't trim it down before pasting.</div>
      </div>

      <h2>What gets extracted</h2>
      <p>After you submit the JD, the system runs an analysis pass that extracts:</p>
      <p><strong>Company name</strong> — Used in the output resume header and for your records.</p>
      <p><strong>Role type</strong> — The closest match from the role type vocabulary (e.g. <span className="inline-code">director-community</span>, <span className="inline-code">developer-relations</span>). This influences which modules score highest.</p>
      <p><strong>Seniority</strong> — IC, manager, senior-manager, director, VP, or C-suite. Affects module scoring — VP-appropriate modules score higher on VP-level JDs.</p>
      <p><strong>Themes</strong> — The 5–8 most prominent themes from the JD vocabulary. These drive the bulk of the module matching.</p>
      <p><strong>Key phrases</strong> — 5–10 exact phrases from the JD text. These are mirrored into the generated resume to help with ATS matching and to signal alignment to the hiring team.</p>

      <h2>Reviewing the extraction</h2>
      <p>After analysis, you'll see a summary of the extracted profile before matching runs. Review it — the AI is generally accurate, but occasionally misclassifies seniority or misses a dominant theme. You can edit any field before proceeding.</p>

      <div className="callout amber">
        <div className="callout-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 2L1 14h14L8 2zM8 7v3M8 12h.01" /></svg>
        </div>
        <div className="callout-text"><strong>Check the phrases.</strong> The extracted phrases are used verbatim in the output. If any of them are boilerplate ("competitive salary," "equal opportunity employer") rather than role-specific language, remove them before generating.</div>
      </div>

      <h2>Saving JDs</h2>
      <p>Every job description you submit is saved to your account. You can re-run a generation against a saved JD at any time — useful if you add new modules to your library and want to regenerate with the updated set. Access saved JDs from the <span className="inline-code">Generate</span> screen under the <strong>History</strong> tab.</p>

      <div className="docs-nav-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Link href="/docs/editing-modules" className="docs-nav-btn">
          <div className="docs-nav-label">← Previous</div>
          <div className="docs-nav-title">Editing modules</div>
        </Link>
        <Link href="/docs/module-matching" className="docs-nav-btn">
          <div className="docs-nav-label">Next →</div>
          <div className="docs-nav-title">Module matching</div>
        </Link>
      </div>
    </>
  )
}
