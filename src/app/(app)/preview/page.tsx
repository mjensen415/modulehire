'use client'

import { useState } from 'react'
import Link from 'next/link'

const SWATCHES = ['#0d9488', '#2563eb', '#7c3aed', '#db2777', '#d97706', '#111827']

const MODULES_USED = [
  { color: '#0d9488', name: 'Security & Infrastructure' },
  { color: 'var(--amber)', name: 'Team Leadership' },
  { color: 'var(--teal)', name: 'Community Growth' },
  { color: 'var(--indigo)', name: 'Developer Onboarding' },
  { color: 'var(--rose)', name: 'Technical Writing' },
]

export default function Preview() {
  const [selectedSwatch, setSelectedSwatch] = useState(0)
  const [hexVal, setHexVal] = useState('#0d9488')
  const [modulesOpen, setModulesOpen] = useState(false)
  const [title, setTitle] = useState('Head of Community — Stripe')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', margin: '-36px -40px', minHeight: '100vh' }}>
      <div className="mobile-banner">Best experienced on desktop.</div>

      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/module-selection" className="top-bar-back">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 2L3 7l6 5" /></svg>
            Back
          </Link>
          <div className="top-bar-title">Resume preview</div>
        </div>
        <div className="top-bar-right">
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>Stripe — Head of Community · Builder Focus</span>
        </div>
      </div>

      <div className="preview-layout" style={{ flex: 1 }}>
        <div className="resume-pane">
          <div className="resume-doc">
            <div className="resume-name">Matthew Jensen</div>
            <div className="resume-contact">matt@example.com · linkedin.com/in/mattjensen · San Francisco, CA</div>
            <div className="resume-tagline">
              Community builder and developer advocate with 10+ years scaling developer ecosystems at high-growth companies. Proven track record turning technical communities into business drivers.
            </div>

            <div className="section-title first accent">Experience</div>

            <div className="entry-title">Head of Community — Fiverr</div>
            <div className="entry-meta">2018–2023 · San Francisco, CA</div>
            <div className="entry-body">
              <p>Led migration of 240-node on-premise infrastructure to AWS, reducing incident response time by 60% and eliminating two annual audit failures through proactive monitoring and automated runbooks.</p>
              <p>Built and scaled a 12-person community team from scratch. Established hiring rubrics, onboarding playbooks, and quarterly performance frameworks aligned to company OKRs.</p>
              <p>Grew Fiverr developer community from 4,200 to 38,000 members in 18 months through events, ambassador program, and content flywheel.</p>
            </div>

            <div className="doc-divider"></div>

            <div className="entry-title">Developer Advocate — GitLab</div>
            <div className="entry-meta">2015–2018 · Remote</div>
            <div className="entry-body">
              <p>Launched GitLab&apos;s open-source contributor program, resulting in 1,200 new contributors and 3 major community-submitted features shipped to GA within the first year.</p>
              <p>Wrote and maintained 80+ developer guides, API references, and tutorials. Reduced support ticket volume by 34% in 12 months and improved developer NPS by 18 points.</p>
            </div>

            <div className="section-title accent">Education</div>
            <div className="entry-title">B.S. Computer Science — UC Davis</div>
            <div className="entry-meta">2010–2014</div>

            <div className="section-title accent">Skills</div>
            <div className="entry-body">
              <p>Community strategy · Developer relations · Technical writing · Team leadership · AWS · API ecosystem development · Content marketing · Open source programs</p>
            </div>
          </div>
        </div>

        <div className="actions-pane">
          <div className="field-label">Resume title</div>
          <input
            className="title-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />

          <div className="field-label">Accent color</div>
          <div className="color-row">
            {SWATCHES.map((c, i) => (
              <div
                key={i}
                className={`color-swatch ${selectedSwatch === i ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => { setSelectedSwatch(i); setHexVal(c) }}
              />
            ))}
            <input
              className="hex-input"
              value={hexVal}
              onChange={e => setHexVal(e.target.value)}
            />
          </div>

          <div className="dl-section">
            <a href="#" className="dl-btn docx">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 2h7l3 3v9H3V2zM10 2v4h4" /><path d="M6 10l1.5 1.5L11 8" /></svg>
              Download DOCX
            </a>
            <a href="#" className="dl-btn pdf">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 2h7l3 3v9H3V2zM10 2v4h4" /><path d="M5 10h6M5 12h4" /></svg>
              Download PDF
            </a>
          </div>

          <button className="regen-link" onClick={() => {}}>Regenerate with different settings</button>

          <div className="modules-used">
            <div
              className="modules-used-header"
              onClick={() => setModulesOpen(v => !v)}
            >
              <span className="modules-used-title">Modules used ({MODULES_USED.length})</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d={modulesOpen ? 'M2 8l4-4 4 4' : 'M2 4l4 4 4-4'} />
              </svg>
            </div>
            {modulesOpen && (
              <div className="modules-used-body open" style={{ padding: '8px 16px 12px' }}>
                {MODULES_USED.map((m, i) => (
                  <div key={i} className="used-module-item">
                    <div className="used-dot" style={{ background: m.color }}></div>
                    <span className="used-name">{m.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
