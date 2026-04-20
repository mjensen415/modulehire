export default function Library() {
  return (
    <>
      <div className="mobile-banner">Best experienced on desktop.</div>

      <div className="filter-bar">
        <select className="filter-select">
          <option>Source Job</option>
          <option>Fiverr 2018–2023</option>
          <option>GitLab 2015–2018</option>
        </select>
        <select className="filter-select">
          <option>Theme</option>
          <option>community-building</option>
          <option>developer-relations</option>
          <option>feedback-loops</option>
        </select>
        <select className="filter-select">
          <option>Type</option>
          <option>Experience</option>
          <option>Skill</option>
          <option>Story</option>
          <option>Positioning</option>
        </select>
        <input type="search" className="search-input" placeholder="Search modules…" />
        <div className="filter-spacer"></div>
        <a href="#" className="btn-primary">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 1v10M1 6h10" /></svg>
          New module
        </a>
      </div>

      <div className="lib-grid">
        {[
          { color: 'teal', domain: 'Security & Infrastructure', status: 'complete', excerpt: 'Led migration of 240-node on-premise infrastructure to AWS, reducing incident response time by 60% and eliminating two annual audit failures.', source: 'Fiverr · 2018–2023' },
          { color: 'amber', domain: 'Team Leadership', status: 'complete', excerpt: 'Built and scaled a 12-person community team from scratch. Established hiring rubrics, onboarding playbooks, and quarterly performance frameworks.', source: 'Fiverr · 2018–2023' },
          { color: 'indigo', domain: 'Developer Onboarding', status: 'needs-review', excerpt: 'Designed and shipped the Fiverr developer onboarding program — documentation portal, office hours cadence, and API sandbox.', source: 'Fiverr · 2018–2023' },
          { color: 'rose', domain: 'Technical Writing', status: 'needs-review', excerpt: 'Wrote and maintained 80+ developer guides, API references, and tutorials. Reduced support ticket volume by 34% in 12 months.', source: 'Fiverr · 2018–2023' },
          { color: 'teal', domain: 'Community Growth', status: 'complete', excerpt: 'Grew Fiverr developer community from 4,200 to 38,000 members in 18 months through events, ambassador program, and content flywheel.', source: 'Fiverr · 2018–2023' },
          { color: 'green', domain: 'Open Source Strategy', status: 'complete', excerpt: 'Launched GitLab\'s open-source contributor program, resulting in 1,200 new contributors and 3 major community-submitted features shipped to GA.', source: 'GitLab · 2015–2018' },
          { color: 'amber', domain: 'Developer Relations', status: 'complete', excerpt: 'Built the DevRel function at GitLab from zero — content strategy, conference presence, and feedback loop to product. Reported directly to CPO.', source: 'GitLab · 2015–2018' },
          { color: 'indigo', domain: 'Product Feedback', status: 'needs-review', excerpt: 'Established structured feedback pipeline connecting 40,000+ users to product roadmap, contributing to 3 flagship feature releases.', source: 'GitLab · 2015–2018' },
          { color: 'teal', domain: 'Event Programming', status: 'complete', excerpt: 'Produced GitLab Commit conference series: 3 events, 12 cities, 6,800 total attendees. Net promoter score averaged 72.', source: 'GitLab · 2015–2018' },
          { color: 'rose', domain: 'Content Strategy', status: 'needs-add', excerpt: 'Needs content — add bullet points from your resume describing content strategy experience.', source: 'Unassigned' },
          { color: 'amber', domain: 'Stakeholder Management', status: 'complete', excerpt: 'Coordinated cross-functional roadmap alignment across engineering, marketing, and sales for a 3-product portfolio serving 22,000 enterprise accounts.', source: 'Fiverr · 2018–2023' },
          { color: 'green', domain: 'Partnership Development', status: 'complete', excerpt: 'Negotiated and launched 14 technology integrations with ecosystem partners, each driving measurable user activation in the 30 days post-launch.', source: 'GitLab · 2015–2018' },
        ].map(({ color, domain, status, excerpt, source }, i) => (
          <div key={i} className={`lib-card c-${color}`}>
            <div className="lib-card-top">
              <div className="lib-domain">{domain}</div>
              <div className={`lib-status ${status}`} title={status.replace('-', ' ')}></div>
            </div>
            <div className="lib-excerpt">{excerpt}</div>
            <div className="lib-footer">
              <span className="lib-source">{source}</span>
              <div className="lib-actions">
                <button className="lib-action-btn" title="Edit">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M7 1.5L9.5 4L3.5 10H1v-2.5L7 1.5z" /></svg>
                </button>
                <button className="lib-action-btn" title="Archive">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="1" y="2" width="9" height="2" rx="0.5" /><path d="M2 4v5h7V4M4 6.5h3" /></svg>
                </button>
                <button className="lib-action-btn del" title="Delete">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 3h7M4.5 3V2h2v1M4 3v6h3V3" /></svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
