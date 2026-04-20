'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function GenerateJD() {
  const [activeTab, setActiveTab] = useState('paste')
  const [jdText, setJdText] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)

  const charCount = jdText.length
  const hasContent = charCount > 50

  return (
    <>
      <div className="mobile-banner">Best experienced on desktop.</div>

      <div className="page-header">
        <div className="page-title">New resume</div>
        <p className="page-sub">Paste or upload a job description to get started.</p>
      </div>

      <div className="tab-bar">
        {['paste', 'upload', 'url'].map(tab => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'paste' && (
        <div className="tab-panel active">
          <div className="jd-textarea-wrap">
            <textarea
              className="jd-textarea"
              placeholder="Paste the job description here…"
              value={jdText}
              onChange={e => setJdText(e.target.value)}
            />
          </div>
          <div className="char-count">{charCount.toLocaleString()} characters</div>

          {hasContent && (
            <div className="jd-preview">
              <div
                className="jd-preview-header"
                onClick={() => setPreviewOpen(o => !o)}
                style={{ cursor: 'pointer' }}
              >
                <span className="jd-preview-title">Extracted JD preview</span>
                <span className="jd-preview-toggle">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d={previewOpen ? 'M2 8l4-4 4 4' : 'M2 4l4 4 4-4'} />
                  </svg>
                  {previewOpen ? 'Hide' : 'Show'}
                </span>
              </div>
              {previewOpen && (
                <div className="jd-preview-body open" style={{ padding: '16px 18px' }}>
                  <div className="jd-meta">
                    <div className="jd-meta-item"><div className="jd-meta-label">Role</div><div className="jd-meta-val">Head of Community</div></div>
                    <div className="jd-meta-item"><div className="jd-meta-label">Company</div><div className="jd-meta-val">Stripe</div></div>
                    <div className="jd-meta-item"><div className="jd-meta-label">Seniority</div><div className="jd-meta-val">Senior / Lead</div></div>
                    <div className="jd-meta-item"><div className="jd-meta-label">Location</div><div className="jd-meta-val">Remote (US)</div></div>
                  </div>
                  <div className="jd-themes-label">Top themes</div>
                  <div className="jd-theme-chips">
                    {['community-building', 'developer-relations', 'feedback-loops', 'zero-to-one', 'team-leadership'].map(t => (
                      <span key={t} className="theme-chip">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="generate-cta-row">
            <Link
              href="/module-selection"
              className="btn-primary"
              style={!hasContent ? { opacity: 0.4, pointerEvents: 'none' } : {}}
              aria-disabled={!hasContent}
            >
              Match to my library →
            </Link>
          </div>
        </div>
      )}

      {activeTab === 'upload' && (
        <div className="tab-panel active">
          <div className="upload-zone-sm">
            <div className="uz-title">Drop a JD file here</div>
            <div className="uz-sub">PDF, DOCX, or TXT accepted</div>
          </div>
          <div className="generate-cta-row">
            <button className="btn-primary" disabled style={{ opacity: 0.4, cursor: 'not-allowed' }}>Match to my library →</button>
          </div>
        </div>
      )}

      {activeTab === 'url' && (
        <div className="tab-panel active">
          <div className="url-row">
            <input type="url" className="url-input" placeholder="https://jobs.stripe.com/positions/head-of-community" />
            <button className="btn-fetch">Fetch</button>
          </div>
          <div className="url-error">
            <div className="url-error-icon">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7.5 2L1 13h13L7.5 2zM7.5 6v3M7.5 11h.01" /></svg>
            </div>
            <div className="url-error-text">Couldn&apos;t fetch this page automatically — paste the text below instead.</div>
          </div>
          <textarea className="url-fallback-textarea" placeholder="Paste the job description text here…" />
          <div className="generate-cta-row" style={{ marginTop: 16 }}>
            <button className="btn-primary" disabled style={{ opacity: 0.4, cursor: 'not-allowed' }}>Match to my library →</button>
          </div>
        </div>
      )}
    </>
  )
}
