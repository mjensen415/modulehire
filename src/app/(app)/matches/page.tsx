'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type RankedModule = {
  module_id: string
  match_score: number
  include_reason: string
}

type ModuleDetail = {
  id: string
  title: string
  weight?: string
  source_company?: string
}

type MatchResult = {
  ranked_modules: RankedModule[]
  recommended_stack: string[]
}

function IconTarget() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="7.5" cy="7.5" r="3" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="7.5" cy="7.5" r="1" fill="currentColor"/>
    </svg>
  )
}

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

function scoreClass(score: number) {
  if (score >= 85) return 'high'
  if (score >= 70) return 'mid'
  return 'low'
}

function generateLink(jdId: string | null, moduleIds: string[]) {
  if (!jdId) return '/generate'
  const params = new URLSearchParams({ jd_id: jdId, modules: moduleIds.join(',') })
  return `/generate?${params.toString()}`
}

export default function Matches() {
  const [jdText, setJdText] = useState('')
  const [phase, setPhase] = useState<'idle' | 'analyzing' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [result, setResult] = useState<MatchResult | null>(null)
  const [modules, setModules] = useState<ModuleDetail[]>([])
  const [jdId, setJdId] = useState<string | null>(null)

  const hasContent = jdText.trim().length > 50

  async function handleAnalyze() {
    if (!hasContent) return
    setPhase('analyzing')
    setErrorMsg('')

    try {
      const supabase = createClient()

      const { data: jdRow, error: insertErr } = await supabase
        .from('job_descriptions')
        .insert({ raw_text: jdText, title: 'Untitled JD' })
        .select('id')
        .single()

      if (insertErr) throw new Error(insertErr.message)
      const id = jdRow.id
      setJdId(id)

      const analyzeRes = await fetch('/api/analyze-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: jdText, jd_id: id }),
      })
      if (!analyzeRes.ok) {
        const body = await analyzeRes.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to analyze JD')
      }

      const matchRes = await fetch('/api/match-modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_id: id }),
      })
      if (!matchRes.ok) {
        const body = await matchRes.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to match modules')
      }
      const matchData: MatchResult = await matchRes.json()
      setResult(matchData)

      const moduleIds = matchData.ranked_modules.map(r => r.module_id)
      if (moduleIds.length > 0) {
        const { data: modData } = await supabase
          .from('modules')
          .select('id, title, weight, source_company')
          .in('id', moduleIds)
        setModules((modData ?? []) as ModuleDetail[])
      }

      setPhase('done')
    } catch (e) {
      setErrorMsg((e as Error).message)
      setPhase('error')
    }
  }

  function resetSearch() {
    setPhase('idle')
    setJdText('')
    setResult(null)
    setModules([])
    setJdId(null)
    setErrorMsg('')
  }

  const sortedModules = result
    ? [...result.ranked_modules].sort((a, b) => b.match_score - a.match_score)
    : []

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Job Matches</span>
          <span className="topbar-sub">— Ranked by module fit</span>
        </div>
        <div className="topbar-actions">
          {phase === 'done' && (
            <>
              <button className="btn-ghost" onClick={resetSearch}>New search</button>
              <Link
                href={generateLink(jdId, result?.recommended_stack ?? [])}
                className="btn-primary"
              >
                Generate resume ↗
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="dash-content">
        {(phase === 'idle' || phase === 'error') && (
          <div className="section-card" style={{ maxWidth: 720 }}>
            <div className="section-head">
              <div className="section-head-title">
                <IconSearch /> Paste a job description
              </div>
            </div>
            <div style={{ padding: '0 16px 20px' }}>
              <textarea
                style={{
                  width: '100%',
                  background: 'var(--bg3)',
                  border: '1px solid var(--border2)',
                  borderRadius: 8,
                  padding: '14px 16px',
                  fontSize: 13,
                  fontFamily: 'var(--font)',
                  color: 'var(--text)',
                  resize: 'vertical',
                  minHeight: 220,
                  outline: 'none',
                  marginBottom: 12,
                  lineHeight: 1.6,
                }}
                placeholder="Paste the full job description here — role, responsibilities, requirements…"
                value={jdText}
                onChange={e => setJdText(e.target.value)}
              />
              {phase === 'error' && (
                <div style={{ fontSize: 12, color: 'var(--rose)', marginBottom: 12, fontFamily: 'var(--mono)' }}>
                  Error: {errorMsg}
                </div>
              )}
              <button
                className="btn-primary"
                onClick={handleAnalyze}
                disabled={!hasContent}
                style={{ opacity: hasContent ? 1 : 0.4, cursor: hasContent ? 'pointer' : 'not-allowed' }}
              >
                <IconTarget /> Analyze matches →
              </button>
            </div>
          </div>
        )}

        {phase === 'analyzing' && (
          <div className="section-card" style={{ maxWidth: 720, textAlign: 'center', padding: '56px 32px' }}>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8, fontWeight: 600 }}>
              Analyzing job description…
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
              Ranking your modules by fit
            </div>
          </div>
        )}

        {phase === 'done' && result && (
          <>
            <div className="section-card" style={{ marginBottom: 16, maxWidth: 800 }}>
              <div className="section-head">
                <div className="section-head-title">
                  <IconTarget /> Ranked modules
                  <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginLeft: 8 }}>
                    {sortedModules.length} matched
                  </span>
                </div>
                <Link
                  href={generateLink(jdId, result.recommended_stack)}
                  className="section-head-action"
                >
                  Generate with top stack →
                </Link>
              </div>

              {sortedModules.map(rm => {
                const mod = modules.find(m => m.id === rm.module_id)
                const inStack = result.recommended_stack.includes(rm.module_id)
                return (
                  <div className="job-item" key={rm.module_id}>
                    <div
                      className="job-co-logo"
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        background: inStack ? 'var(--teal-dim)' : 'var(--surface2)',
                        color: inStack ? 'var(--teal)' : 'var(--text3)',
                      }}
                    >
                      {inStack ? '★' : '○'}
                    </div>
                    <div className="job-info">
                      <div className="job-title">{mod?.title ?? 'Module'}</div>
                      <div className="job-company" style={{ fontSize: 11.5 }}>{rm.include_reason}</div>
                    </div>
                    <div className="job-right" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className={`match-score ${scoreClass(rm.match_score)}`}>
                        {rm.match_score}%
                      </span>
                      {inStack && (
                        <Link
                          href={generateLink(jdId, [rm.module_id])}
                          className="generate-btn"
                        >
                          Generate ↗
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}
