import Link from 'next/link'

export default function ModuleReview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', margin: '-36px -40px', minHeight: '100vh' }}>
      <div className="mobile-banner">Best experienced on desktop.</div>

      <div className="top-bar">
        <div className="top-bar-left">
          <div className="top-bar-title">Review extracted modules</div>
          <div className="top-bar-sub">Matt Jensen · Fiverr + GitLab · 12 modules found</div>
        </div>
        <div className="top-bar-right">
          <button className="mode-toggle">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="5.5" /><path d="M7 4v3l2 1" /></svg>
            Review mode
          </button>
          <Link href="/library" className="btn-primary">Accept all &amp; save →</Link>
        </div>
      </div>

      <div className="review-panels">
        <div className="modules-panel">
          {[
            {
              company: 'Fiverr', role: 'Head of Community', dates: '2018–2023',
              modules: [
                { color: 'teal', domain: 'Security & Infrastructure', content: 'Led migration of 240-node on-premise infrastructure to AWS, reducing incident response time by 60% and eliminating two annual audit failures through proactive monitoring and automated runbooks.' },
                { color: 'amber', domain: 'Team Leadership', content: 'Built and scaled a 12-person community team from scratch. Established hiring rubrics, onboarding playbooks, and quarterly performance frameworks aligned to company OKRs.' },
                { color: 'indigo', domain: 'Developer Onboarding', content: 'Designed and shipped the Fiverr developer onboarding program — documentation portal, office hours cadence, and API sandbox that reduced time-to-first-integration from 11 days to 3.' },
              ]
            },
            {
              company: 'GitLab', role: 'Developer Advocate', dates: '2015–2018',
              modules: [
                { color: 'teal', domain: 'Community Growth', content: 'Grew GitLab\'s open-source community from 4,200 to 38,000 members in 18 months through an ambassador program, content flywheel, and 3-city contributor summit series.' },
                { color: 'rose', domain: 'Technical Writing', content: 'Wrote and maintained 80+ developer guides, API references, and tutorials. Reduced support ticket volume by 34% in 12 months and improved developer NPS by 18 points.' },
                { color: 'green', domain: 'Open Source Strategy', content: 'Launched GitLab\'s open-source contributor program, resulting in 1,200 new contributors and 3 major community-submitted features shipped to GA within the first year.' },
              ]
            }
          ].map(job => (
            <div key={job.company} className="source-job">
              <div className="source-job-header">
                <span className="source-company">{job.company}</span>
                <span className="source-role">{job.role}</span>
                <span className="source-dates">{job.dates}</span>
              </div>
              <div className="module-cards">
                {job.modules.map(m => (
                  <div key={m.domain} className={`mod-card c-${m.color}`}>
                    <div className="mod-domain">{m.domain}</div>
                    <div className="mod-content">{m.content}</div>
                    <div className="mod-actions">
                      <button className="mod-action-btn" title="Edit">
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M7 1.5L9.5 4L3.5 10H1v-2.5L7 1.5z" /></svg>
                      </button>
                      <button className="mod-action-btn" title="Split">
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M5.5 1v9M2 5.5h7" /></svg>
                      </button>
                      <button className="mod-action-btn del" title="Discard">
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l7 7M9 2l-7 7" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="source-panel">
          <div className="source-title">Source text — Fiverr 2018–2023</div>
          <div className="source-text">
            <span className="source-line">Head of Community — Fiverr (2018–2023)</span>
            <span className="source-line">&nbsp;</span>
            <span className="source-line hl-teal">Led infrastructure migration of 240-node AWS deployment.</span>
            <span className="source-line hl-teal">Reduced incident response time by 60%.</span>
            <span className="source-line hl-teal">Eliminated two annual audit failures via automation.</span>
            <span className="source-line">&nbsp;</span>
            <span className="source-line hl-amber">Hired and managed a 12-person community team.</span>
            <span className="source-line hl-amber">Established hiring rubrics and onboarding playbooks.</span>
            <span className="source-line hl-amber">Defined quarterly performance frameworks.</span>
            <span className="source-line">&nbsp;</span>
            <span className="source-line hl-indigo">Designed and launched developer onboarding program.</span>
            <span className="source-line hl-indigo">Shipped documentation portal and API sandbox.</span>
            <span className="source-line hl-indigo">Reduced time-to-first-integration from 11 days to 3.</span>
            <span className="source-line">&nbsp;</span>
            <span className="source-line">Managed $2.4M annual community budget.</span>
            <span className="source-line">Coordinated with 6 cross-functional stakeholders.</span>
            <span className="source-line">Reported directly to VP of Product.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
