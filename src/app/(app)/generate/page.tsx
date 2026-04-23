'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Step = 'input' | 'analyzing' | 'selecting' | 'configuring' | 'generating' | 'done'

type JDData = {
  jd_id: string
  extracted_company: string | null
  extracted_role_type: string | null
  extracted_themes: string[]
  extracted_seniority: string | null
}

type RankedModule = {
  module_id: string
  match_score: number
  include_reason: string
  id: string
  title: string
  source_company: string | null
  source_role_title: string | null
  weight: string
  type: string
  content: string
  themes: string[]
  date_start: string | null
  date_end: string | null
}

type LibModule = {
  id: string
  title: string
  source_company: string | null
  weight: string
  type: string
  content: string
  themes: string[]
}

type EducationEntry = { school: string; degree: string; field: string; year: string }

type Contact = { name: string; email: string; phone: string; linkedin: string; location: string }

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function scoreClass(score: number) {
  if (score >= 85) return 's-hi'
  if (score >= 70) return 's-mid'
  return 's-lo'
}

function weightColor(w: string) {
  if (w === 'anchor') return 'c-teal'
  if (w === 'strong') return 'c-indigo'
  return 'c-amber'
}

// ─── STEP INDICATOR ───────────────────────────────────────────────────────────

const STEPS: Step[] = ['input', 'selecting', 'configuring', 'done']
const STEP_LABELS: Record<string, string> = {
  input: 'Job description',
  selecting: 'Select modules',
  configuring: 'Configure',
  done: 'Download',
}

function StepIndicator({ current }: { current: Step }) {
  const displaySteps = STEPS
  const currentIdx = displaySteps.indexOf(current === 'analyzing' ? 'input' : current === 'generating' ? 'configuring' : current)
  return (
    <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
      {displaySteps.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: i <= currentIdx ? 'var(--teal)' : 'var(--bg3)',
            border: i === currentIdx ? '2px solid var(--teal-glow)' : '1px solid var(--border2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: i <= currentIdx ? '#000' : 'var(--text3)',
            transition: 'all 0.2s',
          }}>{i + 1}</div>
          <span style={{ fontSize: 11, color: i === currentIdx ? 'var(--text)' : 'var(--text3)', marginLeft: 6, marginRight: 16 }}>
            {STEP_LABELS[s]}
          </span>
          {i < displaySteps.length - 1 && (
            <div style={{ width: 20, height: 1, background: i < currentIdx ? 'var(--teal)' : 'var(--border)', marginRight: 16 }} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── SPINNER ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="spinner" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="9" cy="9" r="7" strokeDasharray="14 30" opacity="0.3" />
      <path d="M9 2A7 7 0 0116 9" />
    </svg>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function GeneratePage() {
  const [step, setStep] = useState<Step>('input')
  const [jdText, setJdText] = useState('')
  const [jdData, setJdData] = useState<JDData | null>(null)
  const [rankedModules, setRankedModules] = useState<RankedModule[]>([])
  const [unmatchedModules, setUnmatchedModules] = useState<LibModule[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [contact, setContact] = useState<Contact>({ name: '', email: '', phone: '', linkedin: '', location: '' })
  const [summaryOverride, setSummaryOverride] = useState('')
  const [includeSummary, setIncludeSummary] = useState(true)
  const [education, setEducation] = useState<EducationEntry[]>([])
  const [includeEducation, setIncludeEducation] = useState(false)
  const [skills, setSkills] = useState<string[]>([])
  const [includeSkills, setIncludeSkills] = useState(true)
  const [skillInput, setSkillInput] = useState('')
  const [posVariant, setPosVariant] = useState<'A' | 'B' | 'C' | 'D'>('A')
  const [generatedUrls, setGeneratedUrls] = useState<{ docx_url: string; pdf_url: string } | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const skillInputRef = useRef<HTMLInputElement>(null)

  // Pre-fill contact when reaching configuring step
  useEffect(() => {
    if (step !== 'configuring') return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setContact(c => ({
          ...c,
          email: c.email || data.user!.email || '',
          name: c.name || (data.user!.user_metadata?.full_name as string) || '',
        }))
      }
    })
  }, [step])

  // ── Step 1: analyze + match ─────────────────────────────────────────────────

  async function handleMatch() {
    if (jdText.trim().length < 50) return
    setStep('analyzing')
    setErrorMessage('')
    try {
      const analyzeRes = await fetch('/api/analyze-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: jdText }),
      })
      const analyzeData = await analyzeRes.json()
      if (!analyzeRes.ok) throw new Error(analyzeData.error ?? 'Analysis failed')
      setJdData(analyzeData)

      const matchRes = await fetch('/api/match-modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_id: analyzeData.jd_id }),
      })
      const matchData = await matchRes.json()
      if (!matchRes.ok) throw new Error(matchData.error ?? 'Matching failed')

      const ranked: RankedModule[] = matchData.ranked_modules ?? []
      setRankedModules(ranked)
      setUnmatchedModules(matchData.unmatched_modules ?? [])

      // Default: select all with score >= 70
      setSelectedIds(ranked.filter(m => m.match_score >= 70).map(m => m.module_id))

      // Pre-populate skills from skill-type modules
      const skillModules = ranked.filter(m => m.type === 'skill' && m.match_score >= 70)
      if (skillModules.length > 0) {
        setSkills(skillModules.map(m => m.title))
      }

      setStep('selecting')
    } catch (e) {
      setErrorMessage((e as Error).message)
      setStep('input')
    }
  }

  // ── Step 2: selection helpers ───────────────────────────────────────────────

  function toggleModule(id: string) {
    setSelectedIds(ids =>
      ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
    )
  }

  function moveModule(id: string, dir: -1 | 1) {
    setRankedModules(mods => {
      const idx = mods.findIndex(m => m.module_id === id)
      if (idx < 0) return mods
      const next = idx + dir
      if (next < 0 || next >= mods.length) return mods
      const arr = [...mods]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr
    })
  }

  function addUnmatched(m: LibModule) {
    if (!rankedModules.find(r => r.module_id === m.id)) {
      setRankedModules(mods => [...mods, {
        module_id: m.id, match_score: 0, include_reason: 'Manually added',
        id: m.id, title: m.title, source_company: m.source_company, source_role_title: null,
        weight: m.weight, type: m.type, content: m.content, themes: m.themes,
        date_start: null, date_end: null,
      }])
    }
    setSelectedIds(ids => ids.includes(m.id) ? ids : [...ids, m.id])
    setUnmatchedModules(um => um.filter(u => u.id !== m.id))
  }

  // ── Step 3: skills input ────────────────────────────────────────────────────

  function addSkill(val: string) {
    const trimmed = val.trim().replace(/,+$/, '')
    if (trimmed && !skills.includes(trimmed)) {
      setSkills(s => [...s, trimmed])
    }
    setSkillInput('')
  }

  function onSkillKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addSkill(skillInput)
    } else if (e.key === 'Backspace' && !skillInput && skills.length > 0) {
      setSkills(s => s.slice(0, -1))
    }
  }

  // ── Step 4: generate ────────────────────────────────────────────────────────

  async function handleGenerate() {
    setStep('generating')
    setErrorMessage('')
    try {
      const orderedIds = rankedModules
        .filter(m => selectedIds.includes(m.module_id))
        .map(m => m.module_id)

      const res = await fetch('/api/generate-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module_ids: orderedIds,
          jd_id: jdData!.jd_id,
          positioning_variant: posVariant,
          contact,
          summary_override: summaryOverride || undefined,
          education: includeEducation ? education : [],
          skills: includeSkills ? skills : [],
          include_skills_section: includeSkills,
          include_education_section: includeEducation,
          include_summary: includeSummary,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      setGeneratedUrls({ docx_url: data.docx_url, pdf_url: data.pdf_url })
      setStep('done')
    } catch (e) {
      setErrorMessage((e as Error).message)
      setStep('configuring')
    }
  }

  function reset() {
    setStep('input')
    setJdText('')
    setJdData(null)
    setRankedModules([])
    setSelectedIds([])
    setGeneratedUrls(null)
    setErrorMessage('')
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────

  const hasContent = jdText.trim().length >= 50

  return (
    <div style={{ display: 'flex', flexDirection: 'column', margin: '-36px -40px', minHeight: '100vh' }}>

      {/* TOP BAR */}
      <div className="top-bar">
        <div className="top-bar-left">
          <StepIndicator current={step} />
        </div>
        <div className="top-bar-right">
          {step === 'selecting' && (
            <button className="btn-primary" onClick={() => setStep('configuring')} disabled={selectedIds.length === 0}>
              Configure →
            </button>
          )}
          {step === 'configuring' && (
            <>
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setStep('selecting')}>← Back</button>
              <button className="btn-primary" onClick={handleGenerate} disabled={!contact.name || !contact.email}>
                Generate resume →
              </button>
            </>
          )}
          {step === 'done' && (
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={reset}>Start over</button>
          )}
        </div>
      </div>

      {/* ── INPUT ─────────────────────────────────────────────────────────── */}
      {(step === 'input' || step === 'analyzing') && (
        <div className="dash-content" style={{ maxWidth: 680, margin: '0 auto', width: '100%', padding: '40px 24px' }}>
          <div className="page-title">Generate a tailored resume</div>
          <p className="page-sub" style={{ marginBottom: 24 }}>Paste a job description — we&apos;ll match it to your module library and build a resume.</p>

          <textarea
            className="jd-textarea"
            placeholder="Paste the full job description here…"
            value={jdText}
            onChange={e => setJdText(e.target.value)}
            disabled={step === 'analyzing'}
            rows={12}
          />
          <div className="char-count">{jdText.length.toLocaleString()} characters</div>

          {errorMessage && (
            <div style={{ background: 'var(--rose-dim, oklch(0.4 0.18 10 / 0.15))', border: '1px solid var(--rose)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--rose)', marginBottom: 16 }}>
              {errorMessage}
            </div>
          )}

          <div className="generate-cta-row">
            <button
              className="btn-primary"
              onClick={handleMatch}
              disabled={!hasContent || step === 'analyzing'}
              style={!hasContent ? { opacity: 0.4 } : undefined}
            >
              {step === 'analyzing' ? <><Spinner /> Analyzing…</> : 'Match to my library →'}
            </button>
          </div>
        </div>
      )}

      {/* ── SELECTING ─────────────────────────────────────────────────────── */}
      {step === 'selecting' && (
        <div className="selection-layout" style={{ flex: 1, overflow: 'hidden' }}>

          {/* Left: JD summary */}
          <div className="col-left">
            <div className="jd-summary-label">Job description</div>
            <div className="jd-company">{jdData?.extracted_company ?? '—'}</div>
            <div className="jd-role">{jdData?.extracted_role_type ?? '—'}</div>
            {jdData?.extracted_seniority && (
              <span className="jd-badge">{jdData.extracted_seniority}</span>
            )}
            {jdData?.extracted_themes && jdData.extracted_themes.length > 0 && (
              <>
                <div className="jd-themes-title" style={{ marginTop: 16 }}>Key themes</div>
                <div className="jd-theme-chips">
                  {jdData.extracted_themes.map(t => (
                    <span key={t} className="theme-chip">{t}</span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Center: module list */}
          <div className="col-center">
            <div className="stack-label">
              <span>Ranked modules</span>
              <span>{selectedIds.length} selected</span>
            </div>

            {rankedModules.map((m, i) => {
              const on = selectedIds.includes(m.module_id)
              return (
                <div key={m.module_id} className={`module-row ${!on ? 'off' : ''}`} style={!on ? { opacity: 0.5 } : undefined}>
                  {/* Up/down */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 0, lineHeight: 1 }}
                      onClick={() => moveModule(m.module_id, -1)}
                      disabled={i === 0}
                      title="Move up"
                    >
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M1 6l4-4 4 4" /></svg>
                    </button>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 0, lineHeight: 1 }}
                      onClick={() => moveModule(m.module_id, 1)}
                      disabled={i === rankedModules.length - 1}
                      title="Move down"
                    >
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M1 2l4 4 4-4" /></svg>
                    </button>
                  </div>

                  <div className={`mod-left-bar ${weightColor(m.weight)}`} style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, flexShrink: 0 }} />

                  <div className="mod-info" style={{ flex: 1, minWidth: 0 }}>
                    <div className="mod-domain-sm" style={{ color: m.weight === 'anchor' ? 'var(--teal)' : m.weight === 'strong' ? 'var(--indigo)' : 'var(--amber)' }}>{m.title}</div>
                    {m.source_company && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{m.source_company}</div>
                    )}
                    <div className="mod-excerpt">{m.content.slice(0, 100)}{m.content.length > 100 ? '…' : ''}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {m.match_score > 0 && (
                      <span className={`mod-score ${scoreClass(m.match_score)}`}>{m.match_score}%</span>
                    )}
                    <span className={`plan-chip plan-${m.weight}`} style={{ fontSize: 9 }}>{m.weight}</span>
                    <button
                      className={`mod-toggle ${on ? '' : 'off'}`}
                      onClick={() => toggleModule(m.module_id)}
                      aria-label={`Toggle ${m.title}`}
                    />
                  </div>
                </div>
              )
            })}

            {/* Add more section */}
            {unmatchedModules.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 12, marginBottom: 12 }}
                  onClick={() => setShowUnmatched(v => !v)}
                >
                  {showUnmatched ? '▾' : '▸'} Add more from library ({unmatchedModules.length})
                </button>
                {showUnmatched && unmatchedModules.map(m => (
                  <div key={m.id} className="module-row" style={{ opacity: 0.7 }}>
                    <div className="mod-info" style={{ flex: 1, minWidth: 0 }}>
                      <div className="mod-domain-sm">{m.title}</div>
                      {m.source_company && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.source_company}</div>}
                    </div>
                    <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => addUnmatched(m)}>+ Add</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: positioning variant */}
          <div className="col-right">
            <div className="pos-label">Positioning</div>
            {([
              { letter: 'A', name: 'Community impact' },
              { letter: 'B', name: 'Leadership & scale' },
              { letter: 'C', name: 'Cross-functional' },
              { letter: 'D', name: 'Technical depth' },
            ] as const).map(v => (
              <div
                key={v.letter}
                className={`pos-card ${posVariant === v.letter ? 'selected' : ''}`}
                onClick={() => setPosVariant(v.letter)}
              >
                <div className="pos-letter">{v.letter}</div>
                <div className="pos-name">{v.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CONFIGURING ───────────────────────────────────────────────────── */}
      {step === 'configuring' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>

            {errorMessage && (
              <div style={{ background: 'oklch(0.4 0.18 10 / 0.15)', border: '1px solid var(--rose)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--rose)', marginBottom: 20 }}>
                {errorMessage}
              </div>
            )}

            {/* Contact */}
            <div className="config-section">
              <div className="config-section-title">Contact info</div>
              <div className="mod-edit-cols">
                <div className="mod-edit-row">
                  <label>Name <span style={{ color: 'var(--rose)' }}>*</span></label>
                  <input className="mod-edit-input" value={contact.name} onChange={e => setContact(c => ({ ...c, name: e.target.value }))} placeholder="Your full name" />
                </div>
                <div className="mod-edit-row">
                  <label>Email <span style={{ color: 'var(--rose)' }}>*</span></label>
                  <input className="mod-edit-input" type="email" value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} placeholder="you@example.com" />
                </div>
              </div>
              <div className="mod-edit-cols">
                <div className="mod-edit-row">
                  <label>Phone</label>
                  <input className="mod-edit-input" value={contact.phone} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} placeholder="+1 555 000 0000" />
                </div>
                <div className="mod-edit-row">
                  <label>Location</label>
                  <input className="mod-edit-input" value={contact.location} onChange={e => setContact(c => ({ ...c, location: e.target.value }))} placeholder="City, State" />
                </div>
                <div className="mod-edit-row">
                  <label>LinkedIn</label>
                  <input className="mod-edit-input" value={contact.linkedin} onChange={e => setContact(c => ({ ...c, linkedin: e.target.value }))} placeholder="linkedin.com/in/you" />
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="config-section">
              <div className="config-section-header">
                <div className="config-section-title">Summary</div>
                <button className={`mod-toggle ${includeSummary ? '' : 'off'}`} onClick={() => setIncludeSummary(v => !v)} aria-label="Toggle summary" />
              </div>
              {includeSummary && (
                <div className="mod-edit-row" style={{ marginTop: 12 }}>
                  <label style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 6, display: 'block' }}>Leave blank to let AI generate from your modules</label>
                  <textarea
                    className="mod-edit-textarea"
                    rows={4}
                    value={summaryOverride}
                    onChange={e => setSummaryOverride(e.target.value)}
                    placeholder="Or write your own summary to use verbatim…"
                  />
                </div>
              )}
            </div>

            {/* Skills */}
            <div className="config-section">
              <div className="config-section-header">
                <div className="config-section-title">Skills</div>
                <button className={`mod-toggle ${includeSkills ? '' : 'off'}`} onClick={() => setIncludeSkills(v => !v)} aria-label="Toggle skills" />
              </div>
              {includeSkills && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, cursor: 'text' }} onClick={() => skillInputRef.current?.focus()}>
                    {skills.map(s => (
                      <span key={s} style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 4, padding: '2px 8px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {s}
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1, padding: 0 }} onClick={() => setSkills(ss => ss.filter(x => x !== s))}>×</button>
                      </span>
                    ))}
                    <input
                      ref={skillInputRef}
                      style={{ background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', minWidth: 120, flex: 1 }}
                      placeholder={skills.length === 0 ? 'Type a skill and press Enter…' : ''}
                      value={skillInput}
                      onChange={e => setSkillInput(e.target.value)}
                      onKeyDown={onSkillKeyDown}
                      onBlur={() => { if (skillInput.trim()) addSkill(skillInput) }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Education */}
            <div className="config-section">
              <div className="config-section-header">
                <div className="config-section-title">Education</div>
                <button className={`mod-toggle ${includeEducation ? '' : 'off'}`} onClick={() => setIncludeEducation(v => !v)} aria-label="Toggle education" />
              </div>
              {includeEducation && (
                <div style={{ marginTop: 12 }}>
                  {education.map((e, i) => (
                    <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
                      <div className="mod-edit-cols">
                        <div className="mod-edit-row">
                          <label>School</label>
                          <input className="mod-edit-input" value={e.school} onChange={ev => setEducation(ed => ed.map((x, j) => j === i ? { ...x, school: ev.target.value } : x))} />
                        </div>
                        <div className="mod-edit-row">
                          <label>Degree</label>
                          <input className="mod-edit-input" value={e.degree} onChange={ev => setEducation(ed => ed.map((x, j) => j === i ? { ...x, degree: ev.target.value } : x))} />
                        </div>
                        <div className="mod-edit-row">
                          <label>Field</label>
                          <input className="mod-edit-input" value={e.field} onChange={ev => setEducation(ed => ed.map((x, j) => j === i ? { ...x, field: ev.target.value } : x))} />
                        </div>
                        <div className="mod-edit-row">
                          <label>Year</label>
                          <input className="mod-edit-input" value={e.year} onChange={ev => setEducation(ed => ed.map((x, j) => j === i ? { ...x, year: ev.target.value } : x))} />
                        </div>
                      </div>
                      <button className="btn-ghost" style={{ fontSize: 11, marginTop: 8, color: 'var(--rose)' }} onClick={() => setEducation(ed => ed.filter((_, j) => j !== i))}>Remove</button>
                    </div>
                  ))}
                  <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setEducation(ed => [...ed, { school: '', degree: '', field: '', year: '' }])}>
                    + Add education
                  </button>
                </div>
              )}
            </div>

            {/* Positioning variant */}
            <div className="config-section">
              <div className="config-section-title" style={{ marginBottom: 12 }}>Positioning variant</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {([
                  { letter: 'A', name: 'Community impact', desc: 'Lead with grassroots momentum and community growth' },
                  { letter: 'B', name: 'Leadership & scale', desc: 'Lead with team building and organizational scale' },
                  { letter: 'C', name: 'Cross-functional', desc: 'Lead with stakeholder alignment and influence' },
                  { letter: 'D', name: 'Technical depth', desc: 'Lead with product partnership and technical knowledge' },
                ] as const).map(v => (
                  <label key={v.letter} style={{ display: 'flex', gap: 10, padding: '12px 14px', background: posVariant === v.letter ? 'var(--teal-dim)' : 'var(--surface)', border: `1px solid ${posVariant === v.letter ? 'var(--teal-glow)' : 'var(--border2)'}`, borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s' }}>
                    <input type="radio" name="variant" value={v.letter} checked={posVariant === v.letter} onChange={() => setPosVariant(v.letter)} style={{ marginTop: 2, accentColor: 'var(--teal)' }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: posVariant === v.letter ? 'var(--teal)' : 'var(--text)' }}>{v.letter} — {v.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{v.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── GENERATING ────────────────────────────────────────────────────── */}
      {step === 'generating' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
          <Spinner />
          <div style={{ fontSize: 15, color: 'var(--text2)' }}>Generating your resume…</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>This takes 20–40 seconds</div>
        </div>
      )}

      {/* ── DONE ──────────────────────────────────────────────────────────── */}
      {step === 'done' && generatedUrls && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 24 }}>
          <div style={{ fontSize: 28 }}>✓</div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>Resume ready</div>
          <div style={{ fontSize: 14, color: 'var(--text3)' }}>Download links are valid for 1 hour</div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a href={generatedUrls.docx_url} download className="btn-primary" style={{ textDecoration: 'none' }}>
              Download DOCX
            </a>
            <a href={generatedUrls.pdf_url} download className="btn-secondary" style={{ textDecoration: 'none' }}>
              Download PDF
            </a>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => setStep('configuring')}>
              Generate another variant
            </button>
            <button className="btn-ghost" style={{ fontSize: 13 }} onClick={reset}>
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
