'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Weight = 'dealbreaker' | 'must_have' | 'nice_to_have'
type Criterion = { key: string; label: string; weight: Weight; description?: string }

const WEIGHT_LABELS: Record<Weight, string> = {
  dealbreaker: 'Dealbreaker',
  must_have: 'Must have',
  nice_to_have: 'Nice to have',
}
const WEIGHT_COLORS: Record<Weight, string> = {
  dealbreaker: '#ef4444',
  must_have: 'var(--teal)',
  nice_to_have: 'var(--text3)',
}

let keyCounter = 0
function nextKey() {
  keyCounter += 1
  return `c${keyCounter}`
}

export default function NewJobPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [title, setTitle] = useState('')
  const [rawJd, setRawJd] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [criteria, setCriteria] = useState<Criterion[]>([])

  useEffect(() => {
    fetch('/api/business/organizations')
      .then((r) => r.json())
      .then((data) => {
        const org = data.orgs?.[0]
        if (org) setOrgId(org.id)
        else router.replace('/business/onboarding')
      })
  }, [router])

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !rawJd.trim() || !orgId || analyzing) return
    setAnalyzing(true)
    setError('')
    try {
      const res = await fetch('/api/business/job-postings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, title: title.trim(), raw_jd: rawJd.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not analyze job description')

      setJobId(data.job.id)
      const themes: string[] = data.job.extracted_themes ?? []
      setCriteria(themes.map((theme: string) => ({ key: nextKey(), label: theme, weight: 'must_have' as Weight })))
      setStep(2)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAnalyzing(false)
    }
  }

  function updateCriterion(key: string, patch: Partial<Criterion>) {
    setCriteria((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }

  function removeCriterion(key: string) {
    setCriteria((cs) => cs.filter((c) => c.key !== key))
  }

  function addCriterion() {
    setCriteria((cs) => [...cs, { key: nextKey(), label: '', weight: 'must_have' }])
  }

  async function handleSaveCriteria() {
    if (!jobId || saving) return
    setSaving(true)
    setError('')
    try {
      const payload = criteria
        .filter((c) => c.label.trim())
        .map((c) => ({ label: c.label.trim(), weight: c.weight, description: c.description }))

      const res = await fetch(`/api/business/job-postings/${jobId}/criteria`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criteria: payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save criteria')
      router.push(`/business/jobs/${jobId}`)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 4, letterSpacing: '-0.02em' }}>
        {step === 1 ? 'Create a job posting' : 'Set your scoring criteria'}
      </h1>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 24, fontSize: 12, fontWeight: 600 }}>
        <span style={{ color: step === 1 ? 'var(--teal)' : 'var(--text3)' }}>1 Job description</span>
        <span style={{ color: 'var(--text3)' }}>—</span>
        <span style={{ color: step === 2 ? 'var(--teal)' : 'var(--text3)' }}>2 Scoring criteria</span>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#ef4444', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {step === 1 && (
        <form onSubmit={handleAnalyze}>
          <label className="form-label">Job title</label>
          <input
            className="form-input"
            type="text"
            placeholder="Head of Community"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            style={{ marginBottom: 16 }}
          />

          <label className="form-label">Job description</label>
          <textarea
            className="form-input"
            placeholder="Paste the job description..."
            value={rawJd}
            onChange={(e) => setRawJd(e.target.value)}
            rows={14}
            style={{ marginBottom: 20, resize: 'vertical', fontFamily: 'var(--font)' }}
          />

          <button type="submit" className="btn-primary" disabled={analyzing || !title.trim() || !rawJd.trim() || !orgId}>
            {analyzing ? 'Analyzing job description…' : 'Analyze →'}
          </button>
        </form>
      )}

      {step === 2 && (
        <div>
          <p style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.55 }}>
            We pulled these from the JD. Promote any to dealbreaker, add custom criteria, or remove ones that don&apos;t matter.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {criteria.map((c) => (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text3)', cursor: 'grab', fontSize: 13 }}>⠿</span>
                <input
                  className="form-input"
                  type="text"
                  value={c.label}
                  onChange={(e) => updateCriterion(c.key, { label: e.target.value })}
                  placeholder="Criterion label"
                  maxLength={100}
                  style={{ flex: 1 }}
                />
                <select
                  value={c.weight}
                  onChange={(e) => updateCriterion(c.key, { weight: e.target.value as Weight })}
                  style={{
                    background: 'var(--bg3)',
                    border: '1px solid var(--border2)',
                    borderRadius: 8,
                    padding: '11px 10px',
                    fontSize: 13,
                    fontFamily: 'var(--font)',
                    fontWeight: 600,
                    color: WEIGHT_COLORS[c.weight],
                    cursor: 'pointer',
                  }}
                >
                  {(Object.keys(WEIGHT_LABELS) as Weight[]).map((w) => (
                    <option key={w} value={w}>{WEIGHT_LABELS[w]}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeCriterion(c.key)}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, padding: '4px 8px' }}
                  aria-label="Remove criterion"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <button onClick={addCriterion} className="btn-ghost" style={{ marginBottom: 24 }}>
            + Add criterion
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(1)} className="btn-ghost">← Back</button>
            <button onClick={handleSaveCriteria} className="btn-primary" disabled={saving || criteria.every((c) => !c.label.trim())}>
              {saving ? 'Saving…' : 'Save criteria & open job →'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
