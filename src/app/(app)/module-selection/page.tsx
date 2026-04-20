'use client'

import { useState } from 'react'
import Link from 'next/link'

const MODULES = [
  { color: 'teal', domain: 'Security & Infra', excerpt: 'Led migration of 240-node on-premise infrastructure to AWS…', score: 'hi', locked: true },
  { color: 'amber', domain: 'Team Leadership', excerpt: 'Built and scaled a 12-person community team from scratch…', score: 'hi', locked: false },
  { color: 'teal', domain: 'Community Growth', excerpt: 'Grew community from 4,200 to 38,000 members in 18 months…', score: 'hi', locked: false },
  { color: 'indigo', domain: 'Developer Onboarding', excerpt: 'Designed and shipped the developer onboarding program…', score: 'mid', locked: false },
  { color: 'rose', domain: 'Technical Writing', excerpt: 'Wrote and maintained 80+ developer guides and API references…', score: 'mid', locked: false },
  { color: 'green', domain: 'Open Source Strategy', excerpt: 'Launched contributor program, 1,200 new contributors…', score: 'mid', locked: false },
  { color: 'amber', domain: 'Developer Relations', excerpt: 'Built the DevRel function at GitLab from zero…', score: 'lo', locked: false },
  { color: 'indigo', domain: 'Product Feedback', excerpt: 'Established structured feedback pipeline from 40k users…', score: 'lo', locked: false },
]

const VARIANTS = [
  { letter: 'A', name: 'Builder Focus' },
  { letter: 'B', name: 'Community First' },
  { letter: 'C', name: 'Analytics Focus' },
  { letter: 'D', name: 'Leadership Lens' },
]

export default function ModuleSelection() {
  const [enabled, setEnabled] = useState<Record<number, boolean>>(
    Object.fromEntries(MODULES.map((_, i) => [i, true]))
  )
  const [autoGen, setAutoGen] = useState(true)
  const [selectedVariant, setSelectedVariant] = useState(0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', margin: '-36px -40px', minHeight: '100vh' }}>
      <div className="mobile-banner">Best experienced on desktop.</div>

      <div className="top-bar">
        <div className="top-bar-title">Select modules</div>
        <div className="top-bar-right">
          <div className="auto-toggle-wrap">
            Auto-select
            <button
              className={`toggle-switch ${autoGen ? 'on' : ''}`}
              onClick={() => setAutoGen(v => !v)}
              aria-label="Toggle auto-select"
            />
          </div>
          <Link href="/preview" className="btn-primary">Generate resume →</Link>
        </div>
      </div>

      <div className="selection-layout">
        <div className="col-left">
          <div className="jd-summary-label">Job description</div>
          <div className="jd-company">Stripe</div>
          <div className="jd-role">Head of Community</div>
          <span className="jd-badge">Senior / Lead</span>
          <div className="jd-themes-title">Key themes</div>
          <div className="jd-theme-chips">
            {['community-building', 'developer-relations', 'feedback-loops', 'zero-to-one', 'team-leadership'].map(t => (
              <span key={t} className="theme-chip">{t}</span>
            ))}
          </div>
        </div>

        <div className="col-center">
          <div className="stack-label">
            <span>Module stack</span>
            <span>{Object.values(enabled).filter(Boolean).length} selected</span>
          </div>
          {MODULES.map((m, i) => (
            <div key={i} className="module-row">
              <div className="drag-handle">
                <svg width="10" height="16" viewBox="0 0 10 16" fill="none"><circle cx="3" cy="3" r="1.5" fill="currentColor" /><circle cx="7" cy="3" r="1.5" fill="currentColor" /><circle cx="3" cy="8" r="1.5" fill="currentColor" /><circle cx="7" cy="8" r="1.5" fill="currentColor" /><circle cx="3" cy="13" r="1.5" fill="currentColor" /><circle cx="7" cy="13" r="1.5" fill="currentColor" /></svg>
              </div>
              <div className={`mod-left-bar c-${m.color}`}></div>
              <div className="mod-info">
                <div className={`mod-domain-sm c-${m.color}`}>{m.domain}</div>
                <div className="mod-excerpt">{m.excerpt}</div>
              </div>
              <span className={`mod-score s-${m.score}`}>
                {m.score === 'hi' ? '94%' : m.score === 'mid' ? '71%' : '48%'}
              </span>
              {m.locked ? (
                <div className="anchor-icon" title="Anchor module — always included">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="3" r="1.5" /><path d="M7 4.5V11M4 11h6M4 7.5C4 9 5.3 10 7 10s3-1 3-2.5" /></svg>
                </div>
              ) : (
                <button
                  className={`mod-toggle ${enabled[i] ? '' : 'off'}`}
                  onClick={() => setEnabled(e => ({ ...e, [i]: !e[i] }))}
                  aria-label={`Toggle ${m.domain}`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="col-right">
          <div className="pos-label">Positioning variant</div>
          {VARIANTS.map((v, i) => (
            <div
              key={i}
              className={`pos-card ${selectedVariant === i ? 'selected' : ''}`}
              onClick={() => setSelectedVariant(i)}
            >
              <div className="pos-letter">{v.letter}</div>
              <div className="pos-name">{v.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
