import Link from 'next/link';
import PublicNav from '@/components/layout/PublicNav';
import PublicFooter from '@/components/layout/PublicFooter';

export default function Modules() {
  return (
    <>
      <PublicNav />

      <section className="page-hero">
        <div className="hero-glow"></div>
        <div className="eyebrow">The Module System</div>
        <h1 className="page-headline">One job. Multiple stories.</h1>
        <p className="page-sub">Your experience doesn't fit in a single role description. Modules let every skill stand alone.</p>
      </section>

      <section className="concept-section">
        <div className="concept-grid">
          <div className="concept-text">
            <h2>Traditional resumes flatten your career.</h2>
            <p>A chronological list treats every job as a single story — one title, one description, one narrative. But your 4-year role at that startup contained security work, hiring decisions, vendor negotiations, and documentation projects. All of that got compressed into three bullet points.</p>
            <p>ModuleHire Labs extracts the skill dimensions within each role, treating them as independent assets. Each module is a complete skill story — with context, evidence, and themes — that can be deployed in any combination.</p>
            <p>Your library grows with every resume you upload. By the time you're applying to ten roles, your modules are battle-tested and your output is always specific, never generic.</p>
          </div>
          <div>
            <div className="extract-visual">
              <div className="ev-source" style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%) perspective(800px) rotateY(6deg)', width: 140, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '14px 12px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                <div className="scan-bar"></div>
                <div className="ev-hdr" style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                  <div className="ev-hdr-line"></div>
                  <div className="ev-hdr-line2"></div>
                </div>
                <div className="ev-skill t" style={{ width: '90%' }}></div>
                <div className="ev-skill t" style={{ width: '75%' }}></div>
                <div className="ev-skill g" style={{ width: '65%' }}></div>
                <div className="ev-skill a" style={{ width: '88%' }}></div>
                <div className="ev-skill a" style={{ width: '72%' }}></div>
                <div className="ev-skill g" style={{ width: '58%' }}></div>
                <div className="ev-skill i" style={{ width: '82%' }}></div>
                <div className="ev-skill i" style={{ width: '68%' }}></div>
                <div className="ev-skill g" style={{ width: '55%' }}></div>
                <div style={{ position: 'absolute', bottom: 8, right: 8, fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--teal)', opacity: 0.8, letterSpacing: '0.05em' }}>PARSING...</div>
              </div>

              <svg style={{ position: 'absolute', left: 140, right: 150, top: 0, bottom: 0, width: 'calc(100% - 290px)', height: '100%', overflow: 'visible' }} viewBox="0 0 120 340" preserveAspectRatio="none">
                <path d="M 0 120 C 40 120, 80 90, 120 80" fill="none" stroke="oklch(0.65 0.20 195)" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.7" style={{ animation: 'dashFlow 2s linear infinite' }} />
                <path d="M 0 170 C 40 170, 80 170, 120 170" fill="none" stroke="oklch(0.72 0.18 58)" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.7" style={{ animation: 'dashFlow 2.2s linear infinite 0.4s' }} />
                <path d="M 0 220 C 40 220, 80 255, 120 260" fill="none" stroke="oklch(0.62 0.18 270)" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.7" style={{ animation: 'dashFlow 1.8s linear infinite 0.8s' }} />
              </svg>

              <div className="ev-modules" style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' }}>
                <div className="ev-mod t">
                  <div className="ev-mod-lbl">Security</div>
                  <div className="ev-cline" style={{ width: '90%' }}></div>
                  <div className="ev-cline" style={{ width: '72%' }}></div>
                </div>
                <div className="ev-mod a">
                  <div className="ev-mod-lbl">Leadership</div>
                  <div className="ev-cline" style={{ width: '85%' }}></div>
                  <div className="ev-cline" style={{ width: '68%' }}></div>
                </div>
                <div className="ev-mod i">
                  <div className="ev-mod-lbl">Onboarding</div>
                  <div className="ev-cline" style={{ width: '88%' }}></div>
                  <div className="ev-cline" style={{ width: '62%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="anatomy-section">
        <div className="anatomy-inner">
          <div className="section-label">Module anatomy</div>
          <h2 className="section-headline">Every part of a module has a purpose.</h2>
          <div className="anatomy-layout">
            <div className="anatomy-card-wrap">
              <div className="anatomy-card">
                <div className="anatomy-color-bar"></div>
                <div className="anatomy-card-inner">
                  <div className="anatomy-domain">Security & Infrastructure</div>
                  <div className="anatomy-content">
                    <p>Led the migration of 240-node on-premise infrastructure to AWS, reducing incident response time by 60% and eliminating two annual audit failures. Defined IAM policies, established secrets rotation cadence, and built runbooks used by three subsequent engineers.</p>
                  </div>
                  <div className="anatomy-source">
                    <div className="anatomy-source-dot"></div>
                    <span className="anatomy-source-text">Fiverr · Head of Community · 2018–2023</span>
                  </div>
                  <div className="anatomy-tags">
                    <span className="tag-chip">product-feedback</span>
                    <span className="tag-chip">feedback-loops</span>
                    <span className="tag-chip">community-building</span>
                  </div>
                  <div className="anatomy-footer">
                    <span className="anatomy-score">94% match</span>
                    <span className="anatomy-weight">anchor</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="anatomy-labels">
              <div className="anatomy-label">
                <div className="anatomy-label-dot teal"></div>
                <div className="anatomy-label-text">
                  <div className="anatomy-label-title">Color bar</div>
                  <div className="anatomy-label-desc">Skill domain color — consistent across your entire library.</div>
                </div>
              </div>
              <div className="anatomy-label">
                <div className="anatomy-label-dot teal"></div>
                <div className="anatomy-label-text">
                  <div className="anatomy-label-title">Domain label</div>
                  <div className="anatomy-label-desc">The skill category in JetBrains Mono uppercase — machine-readable and human-readable.</div>
                </div>
              </div>
              <div className="anatomy-label">
                <div className="anatomy-label-dot text3"></div>
                <div className="anatomy-label-text">
                  <div className="anatomy-label-title">Content area</div>
                  <div className="anatomy-label-desc">The specific work within that domain — your words, with context preserved.</div>
                </div>
              </div>
              <div className="anatomy-label">
                <div className="anatomy-label-dot amber"></div>
                <div className="anatomy-label-text">
                  <div className="anatomy-label-title">Source tag</div>
                  <div className="anatomy-label-desc">Where this module came from — company, role, and date range.</div>
                </div>
              </div>
              <div className="anatomy-label">
                <div className="anatomy-label-dot text3"></div>
                <div className="anatomy-label-text">
                  <div className="anatomy-label-title">Theme tags</div>
                  <div className="anatomy-label-desc">Searchable labels that surface this module when a JD mentions related concepts.</div>
                </div>
              </div>
              <div className="anatomy-label">
                <div className="anatomy-label-dot indigo"></div>
                <div className="anatomy-label-text">
                  <div className="anatomy-label-title">Match score</div>
                  <div className="anatomy-label-desc">Shown when a job description is active. Updates per role.</div>
                </div>
              </div>
              <div className="anatomy-label">
                <div className="anatomy-label-dot indigo"></div>
                <div className="anatomy-label-text">
                  <div className="anatomy-label-title">Weight indicator</div>
                  <div className="anatomy-label-desc">Anchor / strong / supporting — controls how much space it takes in the generated resume.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="types-section">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div className="section-label" style={{ justifyContent: 'center', display: 'flex' }}>Module types</div>
          <h2 style={{ fontSize: 'clamp(22px, 2.5vw, 32px)', fontWeight: 800, letterSpacing: '-0.025em' }}>Four types. One library.</h2>
        </div>
        <div className="types-grid">
          <div className="type-card">
            <div className="type-icon teal">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="3" width="6" height="6" rx="1" /><rect x="3" y="11" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" /></svg>
            </div>
            <div className="type-name">Experience</div>
            <p className="type-desc">The work done within a specific skill domain at a specific job. One role can produce many Experience modules — each capturing a different dimension of what you actually did there.</p>
          </div>
          <div className="type-card">
            <div className="type-icon amber">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10 2l2.5 5 5.5.8-4 3.9.9 5.5L10 14.5l-4.9 2.7.9-5.5-4-3.9 5.5-.8z" /></svg>
            </div>
            <div className="type-name">Skill</div>
            <p className="type-desc">A capability you've demonstrated across multiple roles. Not tied to a single job — drawn from patterns across your career. Strong signal for roles that ask for depth.</p>
          </div>
          <div className="type-card">
            <div className="type-icon indigo">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 15s0-8 6-8 6 8 6 8" /><circle cx="10" cy="5" r="2" /></svg>
            </div>
            <div className="type-name">Story</div>
            <p className="type-desc">A behavioral narrative in STAR format — ready for both resume and interview. Built from your experience modules, formatted to show situation, action, and result.</p>
          </div>
          <div className="type-card">
            <div className="type-icon rose">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10 2c0 0-6 3-6 9a6 6 0 0012 0c0-6-6-9-6-9z" /></svg>
            </div>
            <div className="type-name">Positioning</div>
            <p className="type-desc">Your professional identity framing, with variants for different role types. Controls how you're introduced at the top of every generated resume — Community-First vs. Builder vs. Operator.</p>
          </div>
        </div>
      </section>

      <section className="library-section">
        <div className="library-inner">
          <div style={{ marginBottom: 32 }}>
            <div className="section-label">Library preview</div>
            <h2 style={{ fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 800, letterSpacing: '-0.025em' }}>Your modules, ready to deploy.</h2>
          </div>
          <div className="filter-bar">
            <select className="filter-select"><option>Source Job</option><option>Fiverr 2018–2023</option><option>GitLab 2015–2018</option></select>
            <select className="filter-select"><option>Theme</option><option>community-building</option><option>developer-relations</option></select>
            <select className="filter-select"><option>Type</option><option>Experience</option><option>Skill</option><option>Story</option><option>Positioning</option></select>
            <div className="filter-spacer"></div>
          </div>
          <div className="library-grid">
            <div className="lib-card c-teal"><div className="lib-domain">Security & Infrastructure</div><div className="lib-line" style={{ width: '90%' }}></div><div className="lib-line" style={{ width: '75%' }}></div><div className="lib-line" style={{ width: '62%' }}></div><div className="lib-source">Fiverr · 2018–2023</div></div>
            <div className="lib-card c-amber"><div className="lib-domain">Team Leadership</div><div className="lib-line" style={{ width: '85%' }}></div><div className="lib-line" style={{ width: '68%' }}></div><div className="lib-line" style={{ width: '55%' }}></div><div className="lib-source">Fiverr · 2018–2023</div></div>
            <div className="lib-card c-indigo"><div className="lib-domain">Developer Onboarding</div><div className="lib-line" style={{ width: '92%' }}></div><div className="lib-line" style={{ width: '78%' }}></div><div className="lib-line" style={{ width: '60%' }}></div><div className="lib-source">Fiverr · 2018–2023</div></div>
            <div className="lib-card c-rose"><div className="lib-domain">Technical Writing</div><div className="lib-line" style={{ width: '80%' }}></div><div className="lib-line" style={{ width: '65%' }}></div><div className="lib-source">GitLab · 2015–2018</div></div>
            <div className="lib-card c-green"><div className="lib-domain">Strategic Planning</div><div className="lib-line" style={{ width: '88%' }}></div><div className="lib-line" style={{ width: '72%' }}></div><div className="lib-line" style={{ width: '58%' }}></div><div className="lib-source">GitLab · 2015–2018</div></div>
            <div className="lib-card c-teal"><div className="lib-domain">Community Building</div><div className="lib-line" style={{ width: '94%' }}></div><div className="lib-line" style={{ width: '80%' }}></div><div className="lib-line" style={{ width: '66%' }}></div><div className="lib-source">Fiverr · 2018–2023</div></div>
            <div className="lib-card c-amber"><div className="lib-domain">Product Feedback</div><div className="lib-line" style={{ width: '82%' }}></div><div className="lib-line" style={{ width: '70%' }}></div><div className="lib-source">Fiverr · 2018–2023</div></div>
            <div className="lib-card c-indigo"><div className="lib-domain">Developer Relations</div><div className="lib-line" style={{ width: '88%' }}></div><div className="lib-line" style={{ width: '74%' }}></div><div className="lib-line" style={{ width: '55%' }}></div><div className="lib-source">GitLab · 2015–2018</div></div>
            <div className="lib-card c-rose"><div className="lib-domain">Hiring & Recruiting</div><div className="lib-line" style={{ width: '76%' }}></div><div className="lib-line" style={{ width: '62%' }}></div><div className="lib-source">Fiverr · 2018–2023</div></div>
            <div className="lib-card c-teal"><div className="lib-domain">Data & Analytics</div><div className="lib-line" style={{ width: '84%' }}></div><div className="lib-line" style={{ width: '68%' }}></div><div className="lib-line" style={{ width: '52%' }}></div><div className="lib-source">GitLab · 2015–2018</div></div>
          </div>
          <div className="lib-caption">Your library grows with every resume you upload.</div>
        </div>
      </section>

      <PublicFooter />
    </>
  );
}
