'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import MatchReport, { type MatchReportData } from '@/components/MatchReport'

type JdRow = {
  id: string
  extracted_job_title: string | null
  extracted_role_type: string | null
  extracted_company: string | null
  source_url: string | null
  match_report: MatchReportData | null
}

function IconTarget() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.6" opacity="0.3" />
      <circle cx="16" cy="16" r="8" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
      <circle cx="16" cy="16" r="3" fill="currentColor" />
    </svg>
  )
}

export default function Matches() {
  const [jds, setJds] = useState<JdRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/job-descriptions')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setJds(data.job_descriptions ?? [])
      })
      .catch(e => setError((e as Error).message))
  }, [])

  const sorted = (jds ?? []).slice().sort((a, b) => (b.match_report?.overall ?? -1) - (a.match_report?.overall ?? -1))

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Job Matches</span>
          <span className="topbar-sub">— Ranked by match score</span>
        </div>
      </div>

      <div className="dash-content">
        {error && <div style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 16 }}>{error}</div>}

        {jds && sorted.length === 0 && (
          <div className="section-card" style={{ maxWidth: 540 }}>
            <div style={{ padding: '48px 40px', textAlign: 'center' }}>
              <div style={{ color: 'var(--teal)', marginBottom: 18, display: 'flex', justifyContent: 'center' }}>
                <IconTarget />
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 10 }}>
                No job descriptions yet
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65, maxWidth: 380, margin: '0 auto' }}>
                Paste a job description on the Generate page to see how you match.
              </div>
            </div>
          </div>
        )}

        {sorted.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 }}>
            {sorted.map(jd => (
              <Link key={jd.id} href={`/matches/${jd.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <MatchReport
                  variant="compact"
                  report={jd.match_report}
                  jd={{
                    title: jd.extracted_job_title || 'Untitled role',
                    company: jd.extracted_company ?? null,
                  }}
                />
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
