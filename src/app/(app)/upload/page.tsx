'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Upload() {
  const [showPaste, setShowPaste] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const router = useRouter()

  const startParsing = () => {
    setIsParsing(true)
    setTimeout(() => router.push('/module-review'), 4000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 112px)' }}>
      <div className="mobile-banner">Best experienced on desktop — some features may be limited on mobile.</div>

      <div className="upload-wrap">
        <div className="page-title">Upload your resume</div>
        <p className="page-sub">We&apos;ll parse it into modules. Takes about 10 seconds.</p>

        <div
          className="upload-zone"
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }}
          onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
          onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); startParsing() }}
        >
          <div className="upload-icon">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M26 36V16M16 24l10-10 10 10M8 42h36" />
            </svg>
          </div>
          <div className="upload-title">Drop your resume here</div>
          <p className="upload-subtext">PDF, DOCX, or TXT — max 10MB</p>
          <div className="file-badges">
            {['PDF', 'DOCX', 'TXT', 'RTF'].map(t => <span key={t} className="file-badge">{t}</span>)}
          </div>
          <div className="upload-or">or</div>
          <button className="btn-primary" onClick={startParsing}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 10V12h10V10M7 2v8M4 5l3-3 3 3" /></svg>
            Browse files
          </button>
        </div>

        <div className="paste-toggle">
          <button
            className="paste-toggle-btn"
            onClick={() => setShowPaste(v => !v)}
          >
            {showPaste ? 'Hide text input' : 'Or paste your resume text'}
          </button>
        </div>

        {showPaste && (
          <div className="paste-area visible">
            <textarea className="paste-textarea" placeholder="Paste your resume content here — plain text works best…" />
            <button className="btn-secondary" onClick={startParsing}>Parse this text →</button>
          </div>
        )}

        {isParsing && (
          <div className="parsing-state visible">
            <div className="parsing-card">
              <div className="parsing-title">Processing your resume…</div>
              <div className="parse-step done">
                <div className="parse-step-icon done">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="8" cy="8" r="6.5" /><path d="M5 8l2 2 4-4" /></svg>
                </div>
                <span className="parse-step-text">Reading resume</span>
              </div>
              <div className="parse-step loading">
                <div className="parse-step-icon loading">
                  <svg className="spinner" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="8" cy="8" r="6.5" strokeDasharray="12 28" opacity="0.4" />
                    <path d="M8 1.5A6.5 6.5 0 0114.5 8" />
                  </svg>
                </div>
                <span className="parse-step-text">Identifying skill domains…</span>
              </div>
              <div className="parse-step pending">
                <div className="parse-step-icon pending">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="8" cy="8" r="6.5" opacity="0.4" /><path d="M8 5v3M8 11h.01" opacity="0.4" /></svg>
                </div>
                <span className="parse-step-text">Building your library</span>
              </div>
              <div className="progress-bar-wrap"><div className="progress-bar"></div></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
