import Link from 'next/link';

export default function Dashboard() {
  return (
    <>
      <div className="mobile-banner">Best experienced on desktop.</div>

      <div className="page-header">
        <div className="page-title">Good afternoon, Matt.</div>
        <p className="page-sub">You have 24 modules ready to deploy.</p>
      </div>

      {/* STATS */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Modules in library</div>
          <div className="stat-value">24</div>
          <div className="stat-hint">from 2 source resumes</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Resumes generated</div>
          <div className="stat-value">7</div>
          <div className="stat-hint">this month</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last generated</div>
          <div className="stat-value" style={{ fontSize: 22, paddingTop: 6 }}>2 days ago</div>
          <div className="stat-hint">Stripe — Head of Community</div>
        </div>
      </div>

      {/* LIBRARY HEALTH BANNER */}
      <div className="library-health">
        <svg className="health-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="10" cy="10" r="8" />
          <path d="M10 6v4M10 14h.01" />
        </svg>
        <div className="health-text"><strong>Review needed:</strong> 3 modules from your last upload need category confirmation.</div>
        <svg className="health-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3l5 5-5 5" />
        </svg>
      </div>

      {/* GENERATE CTA */}
      <Link href="/generate" className="generate-cta">
        <div className="cta-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z" />
            <path d="M14 2v6h6" />
            <path d="M12 18v-6" />
            <path d="M9 15h6" />
          </svg>
        </div>
        <div className="cta-text">
          <div className="cta-title">Generate new resume</div>
          <div className="cta-sub">Paste a job description and ModuleHire will map the perfect stack.</div>
        </div>
        <div className="cta-arrow">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 10h12M10 4l6 6-6 6" />
          </svg>
        </div>
      </Link>

      {/* RECENT RESUMES */}
      <div className="section-header">
        <div className="section-title">Recent Generations</div>
        <Link href="/library" className="section-action">View all library</Link>
      </div>

      <div className="resume-table">
        <div className="table-head">
          <div className="table-head-cell">Role & Company</div>
          <div className="table-head-cell">Match</div>
          <div className="table-head-cell">Variant</div>
          <div className="table-head-cell">Date</div>
          <div className="table-head-cell" style={{ textAlign: 'right' }}>Actions</div>
        </div>

        <div className="table-row">
          <div className="table-cell title">Head of Community, Stripe</div>
          <div className="table-cell">
            <span style={{ color: 'var(--teal)', fontWeight: 600 }}>92% core match</span>
          </div>
          <div className="table-cell">Builder Focus</div>
          <div className="table-cell date">Oct 12, 2026</div>
          <div className="table-cell" style={{ textAlign: 'right' }}>
            <div className="download-links" style={{ justifyContent: 'flex-end' }}>
              <a href="#" className="dl-link">DOCX</a>
              <a href="#" className="dl-link">PDF</a>
            </div>
          </div>
        </div>

        <div className="table-row">
          <div className="table-cell title">DevRel Manager, Vercel</div>
          <div className="table-cell">
            <span style={{ color: 'var(--teal)', fontWeight: 600 }}>88% core match</span>
          </div>
          <div className="table-cell">Community First</div>
          <div className="table-cell date">Oct 05, 2026</div>
          <div className="table-cell" style={{ textAlign: 'right' }}>
            <div className="download-links" style={{ justifyContent: 'flex-end' }}>
              <a href="#" className="dl-link">DOCX</a>
              <a href="#" className="dl-link">PDF</a>
            </div>
          </div>
        </div>

        <div className="table-row">
          <div className="table-cell title">Product Marketing, Linear</div>
          <div className="table-cell">
            <span style={{ color: 'var(--amber)', fontWeight: 600 }}>74% core match</span>
          </div>
          <div className="table-cell">Analytics Focus</div>
          <div className="table-cell date">Sep 28, 2026</div>
          <div className="table-cell" style={{ textAlign: 'right' }}>
            <div className="download-links" style={{ justifyContent: 'flex-end' }}>
              <a href="#" className="dl-link">DOCX</a>
              <a href="#" className="dl-link">PDF</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
