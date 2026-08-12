'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { isProTier } from '@/lib/plan'

type PrepData = {
  job_title: string
  company: string
  talking_points: Array<{ requirement: string; your_experience: string; talking_point: string }>
  personal_pitch: string
  questions_to_ask: string[]
  red_flags: string[]
}

type Application = {
  id: string
  company: string
  title: string
  jd_text: string | null
  prep_data: PrepData | null
  prep_generated_at: string | null
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function InterviewPrepPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [app, setApp] = useState<Application | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => {
        if (!isProTier(data.tier)) {
          router.replace('/billing?message=interview-prep-requires-pro')
          return
        }
        setCheckingAccess(false)
      })
      .catch(() => setCheckingAccess(false))
  }, [router])

  async function loadApplication() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/job-tracker/${params.id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load application')
      setApp(data.application)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (checkingAccess) return
    loadApplication()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingAccess, params.id])

  async function handleGenerate(regenerate: boolean) {
    setGenerating(true)
    setError('')
    setConfirmRegenerate(false)
    try {
      const res = await fetch(`/api/job-tracker/${params.id}/prep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not generate prep document')
      setApp((prev) => prev ? { ...prev, prep_data: data.prep, prep_generated_at: data.generated_at } : prev)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  if (checkingAccess || loading) {
    return <div className="dash-content" style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
  }

  if (error && !app) {
    return (
      <div className="dash-content">
        <div style={{ background: 'oklch(0.4 0.18 10 / 0.15)', border: '1px solid var(--rose)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--rose)' }}>
          {error}
        </div>
      </div>
    )
  }

  if (!app) return null

  if (!app.jd_text || !app.jd_text.trim()) {
    return (
      <div className="dash-content" style={{ maxWidth: 520, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Add a job description first</div>
        <p style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 22, lineHeight: 1.6 }}>
          Interview prep is generated from the job description you save on this application. Go back and paste it in.
        </p>
        <Link href="/job-tracker" className="btn-primary" style={{ display: 'inline-flex', textDecoration: 'none' }}>
          ← Back to Job Applications
        </Link>
      </div>
    )
  }

  const prep = app.prep_data

  return (
    <div className="dash-content" style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 60px' }}>
      <style>{`
        @media print {
          .app-sidebar, .app-topbar, .no-print { display: none !important; }
          .app-main { margin-left: 0 !important; }
        }
      `}</style>

      <div className="no-print" style={{ marginBottom: 20 }}>
        <Link href="/job-tracker" style={{ fontSize: 12.5, color: 'var(--text3)', textDecoration: 'none' }}>
          ← Back to Job Applications
        </Link>
      </div>

      {error && (
        <div className="no-print" style={{ background: 'oklch(0.4 0.18 10 / 0.15)', border: '1px solid var(--rose)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--rose)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            {app.title} at {app.company}
          </h1>
          {app.prep_generated_at && (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              Generated {formatDateTime(app.prep_generated_at)}
            </div>
          )}
        </div>
        {prep && (
          <div className="no-print" style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn-ghost" onClick={() => window.print()} style={{ fontSize: 12.5 }}>
              Print / Save as PDF
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
          This will create a new prep document and overwrite the current one. Click &quot;Confirm regenerate&quot; to continue.
        </div>
      )}

      {!prep ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border2)', borderRadius: 12, marginTop: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
          <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20, maxWidth: 380, margin: '0 auto 20px', lineHeight: 1.6 }}>
            We&apos;ll compare this job description against your module library and surface the experience most relevant to talk about — plus questions to ask and gaps to prepare for.
          </p>
          <button className="btn-primary" onClick={() => handleGenerate(false)} disabled={generating}>
            {generating ? 'Analyzing your experience…' : 'Generate prep document'}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Your pitch */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              How to open the interview
            </div>
            <div className="section-card" style={{ padding: '18px 20px' }}>
              <p style={{ fontSize: 14.5, color: 'var(--text)', lineHeight: 1.65, margin: 0 }}>
                {prep.personal_pitch}
              </p>
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
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 8 }}>
                    {tp.requirement}
                  </div>
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
              Questions to ask them
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
                  These are areas where your background may not perfectly match — prepare an honest, forward-looking answer for each.
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
  )
}
