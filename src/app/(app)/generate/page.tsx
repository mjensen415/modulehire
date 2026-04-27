'use client'

import { useState, useEffect, useRef, KeyboardEvent, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import ScoreGauge from '@/components/ScoreGauge'

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Step = 'input' | 'analyzing' | 'confirming' | 'selecting' | 'configuring' | 'generating' | 'done'

type JDData = {
  jd_id: string
  extracted_company: string | null
  extracted_role_type: string | null
  extracted_themes: string[]
  extracted_phrases: string[]
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
  role_types: string[]
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

const STEPS: Step[] = ['input', 'confirming', 'selecting', 'configuring', 'done']
const STEP_LABELS: Record<string, string> = {
  input: 'Job description',
  confirming: 'Confirm keywords',
  selecting: 'Select modules',
  configuring: 'Configure',
  done: 'Download',
}

function StepIndicator({ current }: { current: Step }) {
  const displaySteps = STEPS
  const currentIdx = displaySteps.indexOf(
    current === 'analyzing' ? 'input'
    : current === 'generating' ? 'configuring'
    : current
  )
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
  const [jobLevel, setJobLevel] = useState('')
  const [resumeFormat, setResumeFormat] = useState<'classic' | 'corporate' | 'chronological' | 'combination'>('classic')
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false)
  const [coverLetterTone, setCoverLetterTone] = useState<'professional' | 'warm' | 'direct'>('professional')
  const [coverLetterNotes, setCoverLetterNotes] = useState('')
  const [generatedUrls, setGeneratedUrls] = useState<{ docx_url: string; pdf_url: string; docx_filename: string } | null>(null)
  const [resumeHtml, setResumeHtml] = useState<string | null>(null)
  const [coverLetterText, setCoverLetterText] = useState<string | null>(null)
  const [coverLetterUrl, setCoverLetterUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [inputTab, setInputTab] = useState<'paste' | 'url'>('paste')
  const [jdUrl, setJdUrl] = useState('')
  const [fetchingUrl, setFetchingUrl] = useState(false)
  const [keywords, setKeywords] = useState<{ phrase: string; found: boolean }[]>([])
  const [showAllKeywords, setShowAllKeywords] = useState(false)
  const [matchedKeywords, setMatchedKeywords] = useState<string[]>([])
  const [missingKeywords, setMissingKeywords] = useState<string[]>([])
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  const [atsScore, setAtsScore] = useState<number | null>(null)
  const [confirmedPhrases, setConfirmedPhrases] = useState<string[]>([])
  const [confirmedThemes, setConfirmedThemes] = useState<string[]>([])
  const [phraseInput, setPhraseInput] = useState('')
  const [confirmLoading, setConfirmLoading] = useState(false)
  const skillInputRef = useRef<HTMLInputElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const searchParams = useSearchParams()

  // Pre-load JD if ?jd_id= param is present (e.g. from "Regenerate" on My Resumes)
  useEffect(() => {
    const jdId = searchParams.get('jd_id')
    if (!jdId || step !== 'input') return
    setStep('analyzing')
    setErrorMessage('')
    fetch(`/api/job-descriptions/${jdId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setJdData(data.jd)
        setJdText(data.jd_text ?? '')
        setConfirmedPhrases(data.jd.extracted_phrases ?? [])
        setConfirmedThemes(data.jd.extracted_themes ?? [])
        // Now match modules
        return fetch('/api/match-modules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jd_id: data.jd.jd_id }),
        })
      })
      .then(r => r!.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setRankedModules(data.ranked ?? [])
        setUnmatchedModules(data.unmatched ?? [])
        setSelectedIds((data.ranked ?? []).filter((m: RankedModule) => m.match_score >= 60).map((m: RankedModule) => m.module_id))
        setStep('selecting')
      })
      .catch(e => {
        setErrorMessage((e as Error).message)
        setStep('input')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pre-fill contact + skills when reaching configuring step
  useEffect(() => {
    if (step !== 'configuring') return

    // Pre-fill contact from saved profile
    fetch('/api/me').then(r => r.json()).then(profile => {
      if (!profile.error) {
        setContact(c => ({
          name: c.name || profile.name || '',
          email: c.email || profile.email || '',
          phone: c.phone || profile.phone || '',
          linkedin: c.linkedin || profile.linkedin_url || '',
          location: c.location || profile.location || '',
        }))
      }
    }).catch(() => {})

    // Auto-detect job level from extracted seniority
    const seniorityMap: Record<string, string> = {
      ic: 'Associate',
      manager: 'Manager',
      'senior-manager': 'Senior Manager',
      director: 'Director',
      vp: 'VP',
      'c-suite': 'Executive',
    }
    if (jdData?.extracted_seniority) {
      const mapped = seniorityMap[jdData.extracted_seniority]
      if (mapped) setJobLevel(prev => prev || mapped)
    }

    // Auto-populate skills from selected modules
    const selected = rankedModules.filter(m => selectedIds.includes(m.module_id))
    const autoSkills: string[] = []
    for (const m of selected) {
      const isSkillType = m.type === 'skill'
      const hasTechTheme = (m.themes ?? []).includes('technical-content')
      const hasDevRolType = (m.role_types ?? []).some((r: string) => r.includes('developer-relations'))
      if (isSkillType || hasTechTheme || hasDevRolType) {
        if (!autoSkills.includes(m.title)) autoSkills.push(m.title)
      }
    }
    if (autoSkills.length > 0) {
      setSkills(prev => {
        const merged = [...prev]
        for (const s of autoSkills) {
          if (!merged.includes(s)) merged.push(s)
        }
        return merged
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Keyword matching: compute after resume is generated
  useEffect(() => {
    if (!resumeHtml || !jdData?.extracted_phrases?.length) return
    const plainText = resumeHtml.replace(/<[^>]*>/g, ' ').toLowerCase()
    const results = jdData.extracted_phrases.map(phrase => ({
      phrase,
      found: plainText.includes(phrase.toLowerCase()),
    }))
    setKeywords(results)
  }, [resumeHtml, jdData])

  const onIframeLoad = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentDocument?.body) return
    const h = iframe.contentDocument.body.scrollHeight
    iframe.style.height = Math.min(h + 8, 600) + 'px'
  }, [])

  // Close download dropdown on outside click
  useEffect(() => {
    if (!showDownloadMenu) return
    function handler() { setShowDownloadMenu(false) }
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [showDownloadMenu])

  // ── Step 1: fetch URL ───────────────────────────────────────────────────────

  async function handleFetchUrl() {
    if (!jdUrl.trim()) return
    setFetchingUrl(true)
    setErrorMessage('')
    try {
      const res = await fetch('/api/fetch-jd-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: jdUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not fetch URL')
      setJdText(data.text)
      setInputTab('paste')
    } catch (e) {
      setErrorMessage((e as Error).message)
    } finally {
      setFetchingUrl(false)
    }
  }

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
      setConfirmedPhrases(analyzeData.extracted_phrases ?? [])
      setConfirmedThemes(analyzeData.extracted_themes ?? [])
      setStep('confirming')
    } catch (e) {
      setErrorMessage((e as Error).message)
      setStep('input')
    }
  }

  // ── Step 1.5: confirm keywords then match ───────────────────────────────────

  async function handleConfirm() {
    setConfirmLoading(true)
    setErrorMessage('')
    try {
      await fetch(`/api/job-descriptions/${jdData!.jd_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extracted_phrases: confirmedPhrases, extracted_themes: confirmedThemes }),
      })

      const matchRes = await fetch('/api/match-modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_id: jdData!.jd_id }),
      })
      const matchData = await matchRes.json()
      if (!matchRes.ok) throw new Error(matchData.error ?? 'Matching failed')

      const ranked: RankedModule[] = matchData.ranked_modules ?? []
      setRankedModules(ranked)
      setUnmatchedModules(matchData.unmatched_modules ?? [])
      setSelectedIds(ranked.filter(m => m.match_score >= 70).map(m => m.module_id))

      const skillModules = ranked.filter(m => m.type === 'skill' && m.match_score >= 70)
      if (skillModules.length > 0) {
        setSkills(skillModules.map(m => m.title))
      }

      setStep('selecting')
    } catch (e) {
      setErrorMessage((e as Error).message)
    } finally {
      setConfirmLoading(false)
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
        weight: m.weight, type: m.type, content: m.content, themes: m.themes, role_types: [],
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

  // ── Download helper (cross-origin blob trick for correct filename) ───────────

  async function downloadFile(url: string, filename: string) {
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(blobUrl)
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
          cover_letter: includeCoverLetter
            ? { include: true, tone: coverLetterTone, notes: coverLetterNotes || undefined }
            : { include: false, tone: coverLetterTone },
          job_level: jobLevel || undefined,
          format: resumeFormat,
          confirmed_phrases: confirmedPhrases,
          confirmed_themes: confirmedThemes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      setGeneratedUrls({ docx_url: data.docx_url, pdf_url: data.pdf_url, docx_filename: data.docx_filename ?? 'Resume.docx' })
      setResumeHtml(data.resume_html ?? null)
      setCoverLetterText(data.cover_letter_text ?? null)
      setCoverLetterUrl(data.cover_letter_url ?? null)
      setMatchedKeywords(data.matched_keywords ?? [])
      setMissingKeywords(data.missing_keywords ?? [])
      setAtsScore(data.ats_score ?? null)
      setStep('done')
    } catch (e) {
      setErrorMessage((e as Error).message)
      setStep('configuring')
    }
  }

  function reset() {
    setStep('input')
    setJdText('')
    setJdUrl('')
    setInputTab('paste')
    setJdData(null)
    setRankedModules([])
    setSelectedIds([])
    setJobLevel('')
    setResumeFormat('classic')
    setMatchedKeywords([])
    setMissingKeywords([])
    setAtsScore(null)
    setShowDownloadMenu(false)
    setGeneratedUrls(null)
    setResumeHtml(null)
    setCoverLetterText(null)
    setCoverLetterUrl(null)
    setErrorMessage('')
    setConfirmedPhrases([])
    setConfirmedThemes([])
    setPhraseInput('')
    setConfirmLoading(false)
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
          {step === 'confirming' && (
            <>
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setStep('input')}>← Back</button>
              <button className="btn-primary" onClick={handleConfirm} disabled={confirmLoading}>
                {confirmLoading ? <><Spinner /> Matching…</> : 'Looks good →'}
              </button>
            </>
          )}
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
          {step === 'done' && generatedUrls && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="btn-ghost"
                style={{ fontSize: 12 }}
                title="Auto-adjust: re-rank modules for better keyword coverage"
                onClick={() => setStep('selecting')}
              >
                ↺ Auto-adjust
              </button>
              <button
                className="btn-ghost"
                style={{ fontSize: 12 }}
                title="Copy shareable link"
                onClick={() => {
                  navigator.clipboard.writeText(generatedUrls.docx_url).catch(() => {})
                  alert('Link copied to clipboard')
                }}
              >
                ↗ Share
              </button>
              <div style={{ position: 'relative' }}>
                <button
                  className="btn-primary"
                  style={{ fontSize: 12 }}
                  onClick={e => { e.stopPropagation(); setShowDownloadMenu(v => !v) }}
                >
                  ↓ Download ▾
                </button>
                {showDownloadMenu && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 4,
                    background: 'var(--surface)', border: '1px solid var(--border2)',
                    borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 50,
                    minWidth: 160, overflow: 'hidden',
                  }}>
                    <button
                      onClick={e => { e.stopPropagation(); downloadFile(generatedUrls.docx_url, generatedUrls.docx_filename); setShowDownloadMenu(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg3)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      📄 Word (.docx)
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); downloadFile(generatedUrls.pdf_url, generatedUrls.docx_filename.replace('.docx', '.pdf')); setShowDownloadMenu(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg3)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      📑 PDF
                    </button>
                  </div>
                )}
              </div>
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={reset}>Start over</button>
            </div>
          )}
        </div>
      </div>

      {/* ── INPUT ─────────────────────────────────────────────────────────── */}
      {(step === 'input' || step === 'analyzing') && (
        <div className="dash-content" style={{ maxWidth: 680, margin: '0 auto', width: '100%', padding: '40px 24px' }}>
          <div className="page-title">Generate a tailored resume</div>
          <p className="page-sub" style={{ marginBottom: 24 }}>Paste a job description or paste a URL — we&apos;ll match it to your module library and build a resume.</p>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border2)' }}>
            {(['paste', 'url'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => { setInputTab(tab); setErrorMessage('') }}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: `2px solid ${inputTab === tab ? 'var(--teal)' : 'transparent'}`,
                  padding: '8px 16px',
                  fontSize: 13,
                  fontFamily: 'var(--font)',
                  color: inputTab === tab ? 'var(--teal)' : 'var(--text3)',
                  cursor: 'pointer',
                  fontWeight: inputTab === tab ? 600 : 400,
                  marginBottom: -1,
                  transition: 'all 0.15s',
                }}
              >
                {tab === 'paste' ? 'Paste text' : 'From URL'}
              </button>
            ))}
          </div>

          {inputTab === 'paste' && (
            <>
              <textarea
                className="jd-textarea"
                placeholder="Paste the full job description here…"
                value={jdText}
                onChange={e => setJdText(e.target.value)}
                disabled={step === 'analyzing'}
                rows={12}
              />
              <div className="char-count">{jdText.length.toLocaleString()} characters</div>
            </>
          )}

          {inputTab === 'url' && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="url"
                  className="mod-edit-input"
                  style={{ flex: 1 }}
                  placeholder="https://jobs.example.com/posting/12345"
                  value={jdUrl}
                  onChange={e => setJdUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleFetchUrl() }}
                  disabled={fetchingUrl}
                />
                <button
                  className="btn-primary"
                  onClick={handleFetchUrl}
                  disabled={!jdUrl.trim() || fetchingUrl}
                >
                  {fetchingUrl ? <><Spinner /> Fetching…</> : 'Fetch'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
                Note: LinkedIn and some job boards block automated access — paste the text directly instead.
              </div>
            </div>
          )}

          {errorMessage && (
            <div style={{ background: 'var(--rose-dim, oklch(0.4 0.18 10 / 0.15))', border: '1px solid var(--rose)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--rose)', marginBottom: 16 }}>
              {errorMessage}
            </div>
          )}

          {inputTab === 'paste' && (
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
          )}
        </div>
      )}

      {/* ── CONFIRMING ────────────────────────────────────────────────────── */}
      {step === 'confirming' && (
        <div className="dash-content" style={{ maxWidth: 680, margin: '0 auto', width: '100%', padding: '40px 24px' }}>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
              We found these themes in the job description
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {jdData?.extracted_company && <strong style={{ color: 'var(--text2)' }}>{jdData.extracted_company}</strong>}
              {jdData?.extracted_role_type && <span> · {jdData.extracted_role_type}</span>}
            </div>
          </div>

          {errorMessage && (
            <div style={{ background: 'var(--rose-dim, oklch(0.4 0.18 10 / 0.15))', border: '1px solid var(--rose)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--rose)', marginBottom: 16 }}>
              {errorMessage}
            </div>
          )}

          {/* Themes — teal pills */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>Themes</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {confirmedThemes.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>No themes detected.</span>
              )}
              {confirmedThemes.map(t => (
                <span key={t} style={{ background: 'var(--teal-dim)', border: '1px solid var(--teal-glow)', borderRadius: 999, padding: '3px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--teal)' }}>
                  {t}
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontSize: 14, lineHeight: 1, padding: 0, opacity: 0.7 }} onClick={() => setConfirmedThemes(ts => ts.filter(x => x !== t))} aria-label={`Remove ${t}`}>×</button>
                </span>
              ))}
            </div>
          </div>

          {/* Phrases — gray pills */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>Key phrases</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {confirmedPhrases.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>No phrases detected.</span>
              )}
              {confirmedPhrases.map(p => {
                const display = p.length > 40 ? p.slice(0, 40) + '…' : p
                return (
                  <span key={p} title={p.length > 40 ? p : undefined} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 999, padding: '3px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text2)' }}>
                    {display}
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1, padding: 0 }} onClick={() => setConfirmedPhrases(ps => ps.filter(x => x !== p))} aria-label={`Remove ${p}`}>×</button>
                  </span>
                )
              })}
            </div>
          </div>

          {/* Add keyword */}
          <div style={{ marginBottom: 28, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              className="mod-edit-input"
              style={{ flex: 1, fontSize: 13 }}
              placeholder="+ Add keyword"
              value={phraseInput}
              onChange={e => setPhraseInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const v = phraseInput.trim().replace(/,+$/, '')
                  if (v && !confirmedPhrases.includes(v)) setConfirmedPhrases(ps => [...ps, v])
                  setPhraseInput('')
                }
              }}
              onBlur={() => {
                const v = phraseInput.trim().replace(/,+$/, '')
                if (v && !confirmedPhrases.includes(v)) setConfirmedPhrases(ps => [...ps, v])
                setPhraseInput('')
              }}
            />
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

            {/* Estimated ATS score */}
            {selectedIds.length > 0 && (() => {
              const selected = rankedModules.filter(m => selectedIds.includes(m.module_id))
              const anchors = selected.filter(m => m.weight === 'anchor').length
              const strongs = selected.filter(m => m.weight === 'strong').length
              const supporting = selected.length - anchors - strongs
              const estimatedScore = Math.min(
                95,
                50 + Math.min(30, anchors * 10) + Math.min(20, strongs * 5) + Math.min(10, supporting * 2)
              )
              return (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>Estimated ATS score</span>
                    <div style={{ width: 120, height: 4, borderRadius: 2, background: 'var(--bg3)', overflow: 'hidden' }}>
                      <div style={{ width: `${estimatedScore}%`, height: '100%', background: 'var(--teal)', transition: 'width 0.2s' }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)' }}>~{estimatedScore}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', marginTop: 4 }}>
                    ATS systems vary by company — this is an estimate.
                  </div>
                </div>
              )
            })()}

            {/* Format */}
            <div className="config-section">
              <div className="config-section-title" style={{ marginBottom: 12 }}>Format</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {([
                  {
                    key: 'classic' as const,
                    name: 'Classic',
                    desc: 'Centered header, small-caps sections, Times New Roman — traditional ATS-safe',
                    preview: (
                      <div style={{ fontSize: 9, lineHeight: 1.4, fontFamily: "'Times New Roman', serif", marginTop: 8 }}>
                        <div style={{ textAlign: 'center', marginBottom: 4 }}>
                          <div style={{ fontWeight: 700, fontSize: 10, letterSpacing: '0.05em', color: '#111' }}>JANE DOE</div>
                          <div style={{ fontSize: 8, color: '#777' }}>email · phone · location</div>
                        </div>
                        <div style={{ fontWeight: 700, borderBottom: '1.5px solid #111', paddingBottom: 1, marginBottom: 2, fontSize: 8, letterSpacing: '0.06em', fontVariant: 'small-caps' }}>EXPERIENCE</div>
                        <div style={{ fontSize: 8, color: '#333' }}>Led team of 12 across 3 regions…</div>
                      </div>
                    ),
                  },
                  {
                    key: 'corporate' as const,
                    name: 'Corporate',
                    desc: 'Black header bar, grey contact strip, bold section blocks — executive look',
                    preview: (
                      <div style={{ fontSize: 9, fontFamily: 'Calibri, sans-serif', marginTop: 8 }}>
                        <div style={{ background: '#000', padding: '4px 6px', color: '#fff', fontWeight: 700, fontSize: 10, textAlign: 'center', letterSpacing: '0.05em', marginBottom: 2 }}>JANE DOE</div>
                        <div style={{ background: '#F6F6F6', padding: '2px 6px', fontSize: 8, color: '#555', textAlign: 'center', marginBottom: 4 }}>email | phone | city</div>
                        <div style={{ background: '#222', padding: '2px 5px', fontSize: 8, color: '#fff', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 2 }}>PROFESSIONAL EXPERIENCE</div>
                        <div style={{ fontSize: 8, color: '#444' }}>Jan 2022 | Stripe, San Francisco</div>
                      </div>
                    ),
                  },
                  {
                    key: 'chronological' as const,
                    name: 'Chronological',
                    desc: 'Rose name accent, grey section headers with rules — clean timeline format',
                    preview: (
                      <div style={{ fontSize: 9, fontFamily: 'Calibri, sans-serif', marginTop: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 11, color: '#954F72', marginBottom: 1 }}>Jane Doe</div>
                        <div style={{ fontSize: 8, color: '#777', marginBottom: 5 }}>email · phone · city</div>
                        <div style={{ fontWeight: 700, fontSize: 8, color: '#605E5C', letterSpacing: '0.06em', borderBottom: '1.5px solid #605E5C', paddingBottom: 1, marginBottom: 2 }}>EXPERIENCE</div>
                        <div style={{ fontSize: 8, color: '#333', fontWeight: 700 }}>Stripe</div>
                        <div style={{ fontSize: 8, color: '#605E5C', fontStyle: 'italic' }}>Staff Platform Engineer</div>
                      </div>
                    ),
                  },
                  {
                    key: 'combination' as const,
                    name: 'Combination',
                    desc: 'Mauve header, skills-first layout — modules as categories, then work history',
                    preview: (
                      <div style={{ fontSize: 9, lineHeight: 1.4, fontFamily: 'Calibri, sans-serif', marginTop: 8 }}>
                        <div style={{ background: '#C49098', padding: '4px 6px', color: '#fff', fontWeight: 700, fontSize: 10, textAlign: 'center', marginBottom: 2 }}>Jane Doe</div>
                        <div style={{ background: '#EDD5D7', padding: '2px 5px', fontSize: 8, color: '#3D2B2D', fontWeight: 700, marginBottom: 2 }}>RELEVANT SKILLS</div>
                        <div style={{ fontSize: 8, color: '#555', paddingLeft: 4 }}>Community Strategy · DevRel · Leadership…</div>
                      </div>
                    ),
                  },
                ]).map(f => (
                  <label
                    key={f.key}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '12px 14px',
                      background: resumeFormat === f.key ? 'var(--teal-dim)' : 'var(--surface)',
                      border: `1px solid ${resumeFormat === f.key ? 'var(--teal-glow)' : 'var(--border2)'}`,
                      borderRadius: 8,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onClick={() => setResumeFormat(f.key)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="radio" name="format" value={f.key} checked={resumeFormat === f.key} onChange={() => setResumeFormat(f.key)} style={{ accentColor: 'var(--teal)', flexShrink: 0 }} />
                      <div style={{ fontWeight: 600, fontSize: 13, color: resumeFormat === f.key ? 'var(--teal)' : 'var(--text)' }}>{f.name}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, lineHeight: 1.4 }}>{f.desc}</div>
                    {f.preview}
                  </label>
                ))}
              </div>
            </div>

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

            {/* Cover letter */}
            <div className="config-section">
              <div className="config-section-header">
                <div className="config-section-title">Cover letter</div>
                <button className={`mod-toggle ${includeCoverLetter ? '' : 'off'}`} onClick={() => setIncludeCoverLetter(v => !v)} aria-label="Toggle cover letter" />
              </div>
              {includeCoverLetter && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>Tone</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {([
                      { value: 'professional', label: 'Professional & concise' },
                      { value: 'warm', label: 'Warm & conversational' },
                      { value: 'direct', label: 'Direct & confident' },
                    ] as const).map(t => (
                      <label key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                        <input type="radio" name="cl-tone" value={t.value} checked={coverLetterTone === t.value} onChange={() => setCoverLetterTone(t.value)} style={{ accentColor: 'var(--teal)' }} />
                        {t.label}
                      </label>
                    ))}
                  </div>
                  <div className="mod-edit-row">
                    <label style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 6, display: 'block' }}>Anything specific to mention? (optional)</label>
                    <textarea
                      className="mod-edit-textarea"
                      rows={3}
                      value={coverLetterNotes}
                      onChange={e => setCoverLetterNotes(e.target.value)}
                      placeholder="e.g. referred by Jane Smith, excited about their new AI product, open to relocation…"
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

            {/* Target level */}
            <div className="config-section">
              <div className="config-section-title" style={{ marginBottom: 12 }}>Target level</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(['Associate', 'Manager', 'Senior Manager', 'Director', 'VP', 'Executive'] as const).map(level => (
                  <button
                    key={level}
                    onClick={() => setJobLevel(jobLevel === level ? '' : level)}
                    style={{
                      padding: '7px 14px',
                      fontSize: 13,
                      background: jobLevel === level ? 'var(--teal-dim)' : 'var(--surface)',
                      border: `1px solid ${jobLevel === level ? 'var(--teal-glow)' : 'var(--border2)'}`,
                      borderRadius: 6,
                      color: jobLevel === level ? 'var(--teal)' : 'var(--text2)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font)',
                      fontWeight: jobLevel === level ? 600 : 400,
                      transition: 'all 0.15s',
                    }}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10 }}>
                {jobLevel
                  ? `Resume will be framed for a ${jobLevel}-level role`
                  : 'Leave unset to let the AI infer from your modules'}
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
      {step === 'done' && generatedUrls && (() => {
        const matchedKw = keywords.filter(k => k.found)
        const missingKw = keywords.filter(k => !k.found)
        const VISIBLE_KW = 5
        // Use server-computed atsScore when available, fall back to keyword ratio
        const displayScore = atsScore ?? (keywords.length > 0 ? Math.round((matchedKw.length / keywords.length) * 100) : 0)

        return (
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', maxWidth: 1100, margin: '0 auto' }}>

              {/* ── LEFT: preview + downloads ── */}
              <div style={{ flex: 1, minWidth: 0 }}>

                {/* Preview */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Preview</div>
                  <div style={{ borderRadius: 6, boxShadow: '0 2px 20px rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.06)', overflow: 'hidden', background: '#fff' }}>
                    {resumeHtml ? (
                      <iframe
                        ref={iframeRef}
                        srcDoc={resumeHtml}
                        style={{ width: '100%', height: 320, border: 'none', display: 'block' }}
                        onLoad={onIframeLoad}
                        title="Resume preview"
                        sandbox="allow-same-origin"
                      />
                    ) : (
                      <div style={{ padding: 40, color: 'var(--text3)', fontSize: 13 }}>Preview unavailable</div>
                    )}
                  </div>
                </div>

                {/* Downloads hint */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Use the <strong style={{ color: 'var(--text2)' }}>↓ Download ▾</strong> button above to save as Word or PDF · Links expire in 1 hour</div>
                </div>

                {/* Cover letter */}
                {coverLetterText && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Cover Letter</div>
                    <div style={{ background: '#fff', borderRadius: 6, boxShadow: '0 2px 16px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.06)', padding: '28px 36px', maxHeight: 360, overflowY: 'auto' }}>
                      <pre style={{ fontFamily: 'var(--mono)', fontSize: 12.5, lineHeight: 1.75, color: '#333', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{coverLetterText}</pre>
                    </div>
                    {coverLetterUrl && (
                      <div style={{ marginTop: 8 }}>
                        <a href={coverLetterUrl} download className="btn-ghost" style={{ fontSize: 12, textDecoration: 'none' }}>Download cover letter (.txt)</a>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => setStep('configuring')}>Generate another variant</button>
                  <button className="btn-ghost" style={{ fontSize: 13 }} onClick={reset}>Start over</button>
                </div>
              </div>

              {/* ── RIGHT: score + keywords ── */}
              <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* ATS Score gauge card */}
                {(atsScore != null || keywords.length > 0) && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '20px 20px 14px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                      <ScoreGauge score={displayScore} size="md" />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600, marginBottom: 2 }}>ATS Score</div>
                    {keywords.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {matchedKw.length}/{keywords.length} keywords · {
                          [contact.name, contact.email, contact.phone, contact.linkedin, contact.location].filter(Boolean).length
                        }/5 contact fields
                      </div>
                    )}
                  </div>
                )}

                {/* Matched keywords */}
                {matchedKw.length > 0 && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '16px 18px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Ranking well for</div>
                    {matchedKw.slice(0, showAllKeywords ? undefined : VISIBLE_KW).map(k => (
                      <div key={k.phrase} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border2)' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{k.phrase}</span>
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                          <circle cx="9" cy="9" r="8" fill="var(--teal)" opacity="0.15"/>
                          <circle cx="9" cy="9" r="8" stroke="var(--teal)" strokeWidth="1.5"/>
                          <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="var(--teal)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    ))}
                    {matchedKw.length > VISIBLE_KW && (
                      <button onClick={() => setShowAllKeywords(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--teal)', padding: '8px 0 0', fontFamily: 'var(--font)' }}>
                        {showAllKeywords ? 'Show less' : `See all (${matchedKw.length})`}
                      </button>
                    )}
                  </div>
                )}

                {/* Missing keywords */}
                {missingKw.length > 0 && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '16px 18px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Consider adding</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.5 }}>These JD keywords weren&apos;t found in your resume:</div>
                    {missingKw.slice(0, showAllKeywords ? undefined : VISIBLE_KW).map(k => (
                      <div key={k.phrase} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border2)' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>{k.phrase}</span>
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                          <circle cx="9" cy="9" r="8" stroke="var(--border2)" strokeWidth="1.5" fill="var(--bg3)"/>
                        </svg>
                      </div>
                    ))}
                    {missingKw.length > VISIBLE_KW && (
                      <button onClick={() => setShowAllKeywords(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--teal)', padding: '8px 0 0', fontFamily: 'var(--font)' }}>
                        {showAllKeywords ? 'Show less' : `See all (${missingKw.length})`}
                      </button>
                    )}
                  </div>
                )}

                {/* Modules used */}
                {(() => {
                  const usedModules = rankedModules.filter(m => selectedIds.includes(m.module_id))
                  if (usedModules.length === 0) return null
                  return (
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '16px 18px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Modules used</div>
                      {usedModules.map(m => (
                        <div key={m.module_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border2)' }}>
                          <div style={{ width: 3, height: 28, borderRadius: 2, flexShrink: 0, background: m.weight === 'anchor' ? 'var(--teal)' : m.weight === 'strong' ? 'var(--indigo)' : 'var(--amber)' }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                            {m.source_company && <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{m.source_company}</div>}
                          </div>
                          {m.match_score > 0 && (
                            <span className={`mod-score ${scoreClass(m.match_score)}`} style={{ fontSize: 10, flexShrink: 0 }}>{m.match_score}%</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })()}

              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
