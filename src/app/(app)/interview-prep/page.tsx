'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { isProTier } from '@/lib/plan'

type JobDescriptionSummary = {
  id: string
  extracted_job_title: string | null
  extracted_company: string | null
  source_url: string | null
  created_at: string
  has_prep: boolean
}

type PrepData = {
  job_title: string
  company: string
  talking_points: Array<{ requirement: string; your_experience: string; talking_point: string }>
  personal_pitch: string
  questions_to_ask: string[]
  red_flags: string[]
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
  const years = Math.floor(months / 12)
  return `${years} year${years === 1 ? '' : 's'} ago`
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function domainFromUrl(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export default function InterviewPrepPage() {
  const searchParams = useSearchParams()

  const [isPro, setIsPro] = useState(false)
  const [jdList, setJdList] = useState<JobDescriptionSummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [prep, setPrep] = useState<PrepData | null>(null)
  const [prepGeneratedAt, setPrepGeneratedAt] = useState<string | null>(null)
  const [prepLoading, setPrepLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)

  const [pasteText, setPasteText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const pasteRef = useRef<HTMLTextAreaElement>(null)
  const appliedJdParam = useRef(false)

  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then((data) => setIsPro(isProTier(data.tier))).catch(() => null)
    loadJdList()
  }, [])

  async function loadJdList() {
    setListLoading(true)
    try {
      const res = await fetch('/api/job-descriptions')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load job descriptions')
      setJdList(data.job_descriptions ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setListLoading(false)
    }
  }

  // Apply ?jd= once the list has loaded
  useEffect(() => {
    if (listLoading || appliedJdParam.current) return
    const jdParam = searchParams.get('jd')
    if (jdParam) {
      appliedJdParam.current = true
      selectJd(jdParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listLoading])

  function selectJd(id: string) {
    setSelectedId(id)
    setPrep(null)
    setPrepGeneratedAt(null)
    setConfirmRegenerate(false)
    setError('')

    const summary = jdList.find((j) => j.id === id)
    if (isPro && summary?.has_prep) {
      loadCachedPrep(id)
    }
  }

  async function loadCachedPrep(id: string) {
    setPrepLoading(true)
    try {
      const res = await fetch('/api/interview-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_description_id: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load prep')
      setPrep(data.prep)
      setPrepGeneratedAt(data.generated_at)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPrepLoading(false)
    }
  }

  async function handleGenerate(regenerate: boolean) {
    if (!selectedId) return
    setGenerating(true)
    setConfirmRegenerate(false)
    setError('')
    try {
      const res = await fetch('/api/interview-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_description_id: selectedId, regenerate }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'pro_required') {
          setError('Interview prep is a Pro feature. Upgrade to generate a prep document.')
        } else {
          throw new Error(data.error ?? 'Could not generate prep document')
        }
        return
      }
      setPrep(data.prep)
      setPrepGeneratedAt(data.generated_at)
      setJdList((list) => list.map((j) => (j.id === selectedId ? { ...j, has_prep: true } : j)))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSaveAndPrep() {
    if (!pasteText.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/analyze-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: pasteText.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save job description')

      const newJd: JobDescriptionSummary = {
        id: data.jd_id,
        extracted_job_title: data.extracted_job_title,
        extracted_company: data.extracted_company,
        source_url: null,
        created_at: new Date().toISOString(),
        has_prep: false,
      }
      setJdList((list) => [newJd, ...list])
      setPasteText('')
      setSelectedId(newJd.id)
      setPrep(null)
      setPrepGeneratedAt(null)
      await handleGenerate(false)
      setSelectedId(newJd.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const selectedSummary = jdList.find((j) => j.id === selectedId) ?? null

  return (
    <>
      <style>{`
        @media print {
          .app-sidebar, .app-topbar, .no-print { display: none !important; }
          .app-main { margin-left: 0 !important; }
          .interview-prep-left { display: none !important; }
        }
      `}</style>

      <div className="app-topbar">
        <div>
          <span className="topbar-title">Interview Prep</span>
          <span className="topbar-sub">— Talking points built from your own experience</span>
        </div>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

        {/* LEFT — saved JDs */}
        <div className="interview-prep-left" style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>Saved Job Descriptions</div>
            <button
              onClick={() => { setSelectedId(null); pasteRef.current?.focus() }}
              className="btn-ghost"
              style={{ fontSize: 11.5, padding: '4px 10px' }}
            >
              + New
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {listLoading ? (
              <div style={{ padding: 16, color: 'var(--text3)', fontSize: 12.5 }}>Loading…</div>
            ) : jdList.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 12.5, color: 'var(--text3)' }}>
                No saved job descriptions yet. Paste one below to get started.
              </div>
            ) : (
              jdList.map((jd) => {
                const selected = jd.id === selectedId
                return (
                  <div
                    key={jd.id}
                    onClick={() => selectJd(jd.id)}
                    style={{
                      padding: '11px 16px', cursor: 'pointer',
                      borderLeft: `3px solid ${selected ? 'var(--teal)' : 'transparent'}`,
                      background: selected ? 'var(--bg2)' : 'transparent',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {jd.extracted_job_title || 'Untitled role'}
                      </span>
                      {jd.has_prep && (
                        <span title="Prep generated" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0 }} />
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {jd.extracted_company || domainFromUrl(jd.source_url) || 'Unknown company'}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{timeAgo(jd.created_at)}</div>
                  </div>
                )
              })
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', padding: 12, flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 6 }}>
              Paste a new job description
            </div>
            <textarea
              ref={pasteRef}
              className="form-input"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={4}
              maxLength={50_000}
              placeholder="Paste the job description..."
              style={{ fontSize: 12, marginBottom: 8, resize: 'vertical' }}
            />
            <button
              onClick={handleSaveAndPrep}
              disabled={saving || generating || !pasteText.trim()}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', fontSize: 12.5 }}
            >
              {saving || generating ? 'Saving & analyzing…' : 'Save & Prep →'}
            </button>
          </div>
        </div>

        {/* RIGHT — prep document */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          {error && (
            <div className="no-print" style={{ background: 'oklch(0.4 0.18 10 / 0.15)', border: '1px solid var(--rose)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--rose)', marginBottom: 20, maxWidth: 680 }}>
              {error}
            </div>
          )}

          {!selectedId ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div style={{ textAlign: 'center', color: 'var(--text3)', maxWidth: 360 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                  Select a saved job description or paste a new one to generate your interview talking points.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 16 }}>
                <div>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                    {selectedSummary?.extracted_job_title || 'Untitled role'}
                    {selectedSummary?.extracted_company ? ` at ${selectedSummary.extracted_company}` : ''}
                  </h1>
                  {prepGeneratedAt && (
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>Generated {formatDateTime(prepGeneratedAt)}</div>
                  )}
                </div>
                {prep && (
                  <div className="no-print" style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="btn-ghost" onClick={() => window.print()} style={{ fontSize: 12.5 }}>
                      Print
                    </button>
                    {confirmRegenerate ? (
                      <button className="btn-primary" onClick={() => handleGenerate(true)} disabled={generating} style={{ fontSize: 12.5 }}>
                        {generating ? 'Regenerating…' : 'Confirm regenerate'}
                      </button>
                    ) : (
                      <button className="btn-ghost" onClick={() => setConfirmRegenerate(true)} style={{ fontSize: 12.5 }}>
                        Regenerate
                      </button>
                    )}
                  </div>
                )}
              </div>

              {confirmRegenerate && (
                <div className="no-print" style={{ background: 'var(--amber-dim)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: 'var(--amber)', marginBottom: 20 }}>
                  This will replace your current prep document. Click &quot;Confirm regenerate&quot; to continue.
                </div>
              )}

              {prepLoading ? (
                <div style={{ color: 'var(--text3)', fontSize: 13.5, marginTop: 20 }}>Loading…</div>
              ) : !prep ? (
                <div style={{ textAlign: 'center', padding: '48px 20px', border: '1px dashed var(--border2)', borderRadius: 12, marginTop: 20 }}>
                  <p style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 18, maxWidth: 420, margin: '0 auto 18px', lineHeight: 1.6 }}>
                    We&apos;ll match your experience to this role&apos;s requirements and build a talking points doc.
                  </p>
                  <button
                    onClick={() => handleGenerate(false)}
                    disabled={generating || !isPro}
                    className="btn-primary"
                    style={{ opacity: isPro ? 1 : 0.5 }}
                  >
                    {generating ? 'Analyzing your experience…' : 'Generate Prep Document'}
                    {!isPro && ' 🔒 Pro'}
                  </button>
                  {!isPro && (
                    <div style={{ marginTop: 14 }}>
                      <Link href="/billing" style={{ fontSize: 12.5, color: 'var(--teal)', textDecoration: 'none', fontWeight: 600 }}>
                        Upgrade to Pro to unlock interview prep →
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {/* Your pitch */}
                  <section>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                      How to open the interview
                    </div>
                    <div className="section-card" style={{ padding: '18px 20px' }}>
                      <p style={{ fontSize: 14.5, color: 'var(--text)', lineHeight: 1.65, margin: 0 }}>{prep.personal_pitch}</p>
                    </div>
                  </section>

                  {/* Talking points */}
                  <section>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                      Talking points
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {prep.talking_points.map((tp, i) => (
                        <div key={i} className="section-card" style={{ padding: '16px 20px' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 8 }}>{tp.requirement}</div>
                          <div style={{ background: 'var(--teal-dim)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>
                              Your experience
                            </div>
                            <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.55 }}>{tp.your_experience}</div>
                          </div>
                          <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>
                              Talking point
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.55 }}>{tp.talking_point}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Questions to ask */}
                  <section>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                      Ask them this
                    </div>
                    <div className="section-card" style={{ padding: '16px 20px' }}>
                      <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {prep.questions_to_ask.map((q, i) => (
                          <li key={i} style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.55 }}>{q}</li>
                        ))}
                      </ol>
                    </div>
                  </section>

                  {/* Gaps to prepare for */}
                  {prep.red_flags.length > 0 && (
                    <section>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                        Gaps to prepare for
                      </div>
                      <div style={{ background: 'var(--amber-dim)', border: '1px solid var(--amber)', borderRadius: 12, padding: '16px 20px' }}>
                        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.55 }}>
                          Be ready to address these honestly.
                        </p>
                        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {prep.red_flags.map((rf, i) => (
                            <li key={i} style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.55 }}>{rf}</li>
                          ))}
                        </ul>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
