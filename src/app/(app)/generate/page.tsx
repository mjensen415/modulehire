'use client'

import { useState, useEffect, useRef, KeyboardEvent, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import ScoreGauge from '@/components/ScoreGauge'

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Step = 'input' | 'analyzing' | 'building' | 'configuring' | 'generating' | 'done'

type AlignmentSuggestion = {
  theme: string
  module_id: string
  module_title: string
  original: string
  suggestion: string
}

type JDData = {
  jd_id: string
  extracted_company: string | null
  extracted_role_type: string | null
  extracted_job_title: string | null
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

const STEPS: Step[] = ['input', 'building', 'configuring', 'done']
const STEP_LABELS: Record<string, string> = {
  input: 'Job description',
  building: 'Review & build',
  configuring: 'Configure',
  done: 'Download',
}

function StepIndicator({ current }: { current: Step }) {
  // Map transient steps to their display step
  const display: Step =
    current === 'analyzing' ? 'input' :
    current === 'generating' ? 'configuring' :
    current
  const displaySteps: Step[] = ['input', 'building', 'configuring']
  const currentIdx = displaySteps.indexOf(display)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {displaySteps.map((s, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: done ? 'var(--teal-dim)' : active ? 'var(--teal)' : 'var(--bg3)',
              border: active ? '2px solid var(--teal-glow)' : done ? '1px solid var(--teal-glow)' : '1px solid var(--border2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700,
              color: done ? 'var(--teal)' : active ? '#fff' : 'var(--text3)',
              transition: 'all 0.25s',
              flexShrink: 0,
            }}>
              {done ? '✓' : i + 1}
            </div>
            <span style={{
              fontSize: 12, marginLeft: 7, marginRight: 20,
              fontWeight: active ? 700 : 500,
              color: active ? 'var(--text)' : done ? 'var(--teal)' : 'var(--text3)',
            }}>
              {STEP_LABELS[s]}
            </span>
            {i < displaySteps.length - 1 && (
              <div style={{ width: 24, height: 1.5, background: done ? 'var(--teal-glow)' : 'var(--border2)', marginRight: 20, borderRadius: 1 }} />
            )}
          </div>
        )
      })}
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
  const [savedSummary, setSavedSummary] = useState('')
  const [includeSummary, setIncludeSummary] = useState(true)
  const [suggestedSummary, setSuggestedSummary] = useState('')
  const [suggestedThemes, setSuggestedThemes] = useState<string[]>([])
  const [suggestingSummary, setSuggestingSummary] = useState(false)
  const [suggestError, setSuggestError] = useState('')
  const [savingSummaryDefault, setSavingSummaryDefault] = useState(false)
  const [savedSummaryDefault, setSavedSummaryDefault] = useState(false)
  const [education, setEducation] = useState<EducationEntry[]>([])
  const [includeEducation, setIncludeEducation] = useState(false)
  const [awardsText, setAwardsText] = useState('')
  const [includeAwards, setIncludeAwards] = useState(false)
  const [skills, setSkills] = useState<string[]>([])
  const [includeSkills, setIncludeSkills] = useState(true)
  const [skillInput, setSkillInput] = useState('')
  const [posVariant, setPosVariant] = useState<'A' | 'B' | 'C' | 'D'>('A')
  const [jobTitle, setJobTitle] = useState('')
  const [jobTitleSaving, setJobTitleSaving] = useState(false)
  const [jobLevel, setJobLevel] = useState('')
  const [resumeFormat, setResumeFormat] = useState<'classic' | 'tech' | 'combination' | 'executive' | 'minimal' | 'two-column'>('classic')
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
  const [alignmentSuggestions, setAlignmentSuggestions] = useState<AlignmentSuggestion[]>([])
  const [alignmentMatched, setAlignmentMatched] = useState<string[]>([])
  const [alignmentStates, setAlignmentStates] = useState<Record<string, 'accepted' | 'skipped'>>({})
  const [alignmentLoading, setAlignmentLoading] = useState(false)
  const [alignmentError, setAlignmentError] = useState<string | null>(null)
  const [savingToLibrary, setSavingToLibrary] = useState(false)
  const [savedToLibrary, setSavedToLibrary] = useState(false)
  const [showOveragePrompt, setShowOveragePrompt] = useState(false)
  const [overageCheckoutLoading, setOverageCheckoutLoading] = useState(false)
  const [showMonthlyLimitModal, setShowMonthlyLimitModal] = useState(false)
  const [userTier, setUserTier] = useState<string>('free')
  const [planLoaded, setPlanLoaded] = useState(false)
  const [editingSummary, setEditingSummary] = useState(false)
  const [hasDraft, setHasDraft] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)
  // Building step UI state
  const [collapsedJobs, setCollapsedJobs] = useState<Record<string, boolean>>({})
  const [openSuggestion, setOpenSuggestion] = useState<string | null>(null)
  // Inline module editing
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [editSaveToLibrary, setEditSaveToLibrary] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  // Content overrides: keyed by module_id, holds edited content for this session
  const [moduleContentOverrides, setModuleContentOverrides] = useState<Record<string, string>>({})
  const skillInputRef = useRef<HTMLInputElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchParams = useSearchParams()

  // Load tier on mount so the Pro-only ATS breakdown is ready before reaching done.
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(profile => {
        if (!profile.error && profile.tier) setUserTier(profile.tier)
        setPlanLoaded(true)
      })
      .catch(() => {
        setPlanLoaded(true)
      })
  }, [])

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
        setStep('building')
      })
      .catch(e => {
        setErrorMessage((e as Error).message)
        setStep('input')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Draft: load on mount ────────────────────────────────────────────────────
  // Only load if no ?jd_id= param (that flow takes precedence)
  useEffect(() => {
    if (searchParams.get('jd_id')) return
    fetch('/api/draft-generation')
      .then(r => r.json())
      .then(({ draft }) => {
        if (!draft) return
        // Map old step names from before the 3-step redesign, then guard terminal states
        const stepMap: Record<string, Step> = {
          confirming: 'building', selecting: 'building', aligning: 'building',
        }
        const rawStep = draft.step as string
        const mappedStep: Step = stepMap[rawStep] ?? rawStep as Step
        const safeStep: Step = mappedStep === 'done' || mappedStep === 'generating' ? 'configuring' : mappedStep
        // Only show the banner on 'input' step; for deeper steps, restore silently
        if (safeStep === 'input' || safeStep === 'analyzing') {
          setHasDraft(true)
          return // Show banner, don't auto-restore
        }
        restoreDraft(draft, safeStep)
      })
      .catch(() => {}) // silently ignore
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function restoreDraft(draft: Record<string, unknown>, safeStep?: Step) {
    const targetStep: Step = (safeStep ?? (draft.step as Step))
    if (draft.jd_text) setJdText(draft.jd_text as string)
    if (draft.confirmed_themes) setConfirmedThemes(draft.confirmed_themes as string[])
    if (draft.confirmed_phrases) setConfirmedPhrases(draft.confirmed_phrases as string[])
    if (draft.selected_module_ids) setSelectedIds(draft.selected_module_ids as string[])
    if (draft.alignment_states) setAlignmentStates(draft.alignment_states as Record<string, 'accepted' | 'skipped'>)
    if (draft.resume_format) setResumeFormat(draft.resume_format as 'classic' | 'tech' | 'combination')
    if (draft.job_level !== undefined) setJobLevel(draft.job_level as string)
    if (draft.pos_variant) setPosVariant(draft.pos_variant as 'A' | 'B' | 'C' | 'D')
    if (draft.include_summary !== undefined) setIncludeSummary(draft.include_summary as boolean)
    if (draft.summary_override !== undefined) setSummaryOverride(draft.summary_override as string)
    if (draft.include_cover_letter !== undefined) setIncludeCoverLetter(draft.include_cover_letter as boolean)
    if (draft.cover_letter_tone) setCoverLetterTone(draft.cover_letter_tone as 'professional' | 'warm' | 'direct')
    if (draft.cover_letter_notes !== undefined) setCoverLetterNotes(draft.cover_letter_notes as string)
    if (draft.include_skills !== undefined) setIncludeSkills(draft.include_skills as boolean)
    if (draft.skills) setSkills(draft.skills as string[])
    if (draft.include_education !== undefined) setIncludeEducation(draft.include_education as boolean)
    if (draft.education) setEducation(draft.education as EducationEntry[])
    if (draft.include_awards !== undefined) setIncludeAwards(draft.include_awards as boolean)
    if (draft.awards_text !== undefined) setAwardsText(draft.awards_text as string)
    // Re-fetch ranked modules if restoring past input
    if (draft.jd_id && ['building', 'configuring'].includes(targetStep)) {
      fetch(`/api/job-descriptions/${draft.jd_id}`)
        .then(r => r.json())
        .then(data => {
          if (!data.error) setJdData(data.jd)
        })
        .catch(() => {})
      fetch('/api/match-modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_id: draft.jd_id }),
      })
        .then(r => r.json())
        .then(data => {
          if (!data.error) {
            setRankedModules(data.ranked ?? [])
            setUnmatchedModules(data.unmatched ?? [])
          }
        })
        .catch(() => {})
    }
    setStep(targetStep)
    setDraftRestored(true)
    setHasDraft(false)
  }

  // ── Draft: save on state changes (debounced 2s) ─────────────────────────────
  // Build a serialisable snapshot of all persisted fields
  const draftPayload = useMemo(() => ({
    step,
    jd_id: jdData?.jd_id ?? null,
    jd_text: jdText,
    selected_module_ids: selectedIds,
    confirmed_themes: confirmedThemes,
    confirmed_phrases: confirmedPhrases,
    alignment_states: alignmentStates,
    resume_format: resumeFormat,
    job_level: jobLevel,
    pos_variant: posVariant,
    include_summary: includeSummary,
    summary_override: summaryOverride,
    include_cover_letter: includeCoverLetter,
    cover_letter_tone: coverLetterTone,
    cover_letter_notes: coverLetterNotes,
    include_skills: includeSkills,
    skills,
    include_education: includeEducation,
    education,
    include_awards: includeAwards,
    awards_text: awardsText,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [step, jdData, jdText, selectedIds, confirmedThemes, confirmedPhrases, alignmentStates,
      resumeFormat, jobLevel, posVariant, includeSummary, summaryOverride, includeCoverLetter,
      coverLetterTone, coverLetterNotes, includeSkills, skills, includeEducation, education,
      includeAwards, awardsText])

  // ── Building step: group modules by job ────────────────────────────────────
  // Key on (source_company, source_role_title, date_start) so two stints at the
  // same company with the same title still produce separate groups, and modules
  // with no company each get their own group rather than collapsing into "||".
  const modulesByJob = useMemo(() => {
    const groups = new Map<string, { company: string; role: string; dates: string; modules: RankedModule[] }>()
    for (const m of rankedModules) {
      // Use module_id as tiebreaker for truly unattributed modules so they don't merge
      const company = m.source_company?.trim() || null
      const role    = m.source_role_title?.trim() || ''
      const key = company
        ? `${company}||${role}||${m.date_start ?? ''}`
        : `__unattributed__${m.module_id}`
      if (!groups.has(key)) {
        const start = m.date_start ? new Date(m.date_start).getFullYear().toString() : null
        const isPresent = !m.date_end || m.date_end.toLowerCase() === 'present'
        const end = isPresent ? 'Present' : new Date(m.date_end!).getFullYear().toString()
        groups.set(key, {
          company: company ?? 'Other',
          role,
          dates: start ? `${start} — ${end}` : '',
          modules: [],
        })
      }
      groups.get(key)!.modules.push(m)
    }
    return Array.from(groups.values())
  }, [rankedModules])

  // ── Building step: live missing phrases (client-side "Consider Adding") ─────
  const missingPhrases = useMemo(() => {
    const phrases = confirmedPhrases.length > 0 ? confirmedPhrases : (jdData?.extracted_phrases ?? [])
    if (phrases.length === 0) return []
    // Aggregate effective content of all selected modules
    const selectedContent = rankedModules
      .filter(m => selectedIds.includes(m.module_id))
      .map(m => (moduleContentOverrides[m.module_id] ?? m.content).toLowerCase())
      .join(' ')
    return phrases.filter(p => !selectedContent.includes(p.toLowerCase()))
  }, [confirmedPhrases, jdData?.extracted_phrases, rankedModules, selectedIds, moduleContentOverrides])

  // ── Job title coverage check ─────────────────────────────────────────────────
  const jobTitleCovered = useMemo(() => {
    const title = jdData?.extracted_job_title
    if (!title) return true // nothing to check
    const selectedContent = rankedModules
      .filter(m => selectedIds.includes(m.module_id))
      .map(m => (moduleContentOverrides[m.module_id] ?? m.content).toLowerCase())
      .join(' ')
    return selectedContent.includes(title.toLowerCase())
  }, [jdData?.extracted_job_title, rankedModules, selectedIds, moduleContentOverrides])

  // ── Estimated ATS score ───────────────────────────────────────────────────────
  const estimatedAtsScore = useMemo(() => {
    const phrases = confirmedPhrases.length > 0 ? confirmedPhrases : (jdData?.extracted_phrases ?? [])
    if (phrases.length === 0) return null
    const covered = phrases.length - missingPhrases.length
    // Weight job title: +5 bonus points if covered, deduct if not
    const titleBonus = jdData?.extracted_job_title ? (jobTitleCovered ? 5 : -5) : 0
    const base = Math.round((covered / phrases.length) * 100)
    return Math.max(0, Math.min(100, base + titleBonus))
  }, [confirmedPhrases, jdData?.extracted_phrases, jdData?.extracted_job_title, missingPhrases.length, jobTitleCovered])

  // ── Building step: live theme coverage ─────────────────────────────────────
  const coveredThemes = useMemo(() => {
    const covered = new Set<string>()
    const themes = confirmedThemes.length > 0 ? confirmedThemes : (jdData?.extracted_themes ?? [])
    for (const m of rankedModules) {
      if (!selectedIds.includes(m.module_id)) continue
      // Tag-based coverage (set at parse time in library)
      for (const t of m.themes ?? []) covered.add(t)
      // Content-based coverage: check if any JD theme string appears in effective content
      const effectiveContent = (moduleContentOverrides[m.module_id] ?? m.content).toLowerCase()
      for (const theme of themes) {
        if (effectiveContent.includes(theme.toLowerCase())) covered.add(theme)
      }
    }
    return covered
  }, [rankedModules, selectedIds, moduleContentOverrides, confirmedThemes, jdData?.extracted_themes])

  useEffect(() => {
    // Don't save ephemeral / terminal states
    if (['input', 'analyzing', 'generating', 'done'].includes(step)) return
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current)
    draftSaveTimer.current = setTimeout(() => {
      fetch('/api/draft-generation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftPayload),
      }).catch(() => {})
    }, 2000)
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPayload])

  // Pre-fill contact + skills when reaching configuring step
  useEffect(() => {
    if (step !== 'configuring') return

    // Pre-fill contact + summary from saved profile
    fetch('/api/me').then(r => r.json()).then(profile => {
      if (!profile.error) {
        setContact(c => ({
          name: c.name || profile.name || '',
          email: c.email || profile.email || '',
          phone: c.phone || profile.phone || '',
          linkedin: c.linkedin || profile.linkedin_url || '',
          location: c.location || profile.location || '',
        }))
        if (profile.summary) {
          setSavedSummary(profile.summary)
          setSummaryOverride(prev => prev || profile.summary)
        }
        if (profile.tier) setUserTier(profile.tier)
      }
      setPlanLoaded(true)
    }).catch(() => { setPlanLoaded(true) })

    // Pre-fill education from saved profile entries (only if user hasn't
    // already added/edited rows in this session).
    fetch('/api/education').then(r => r.json()).then(data => {
      if (Array.isArray(data?.education) && data.education.length > 0) {
        setEducation(prev => {
          if (prev.length > 0) return prev
          return data.education.map((e: { school?: string; degree?: string; field?: string; year?: string }) => ({
            school: e.school ?? '',
            degree: e.degree ?? '',
            field:  e.field  ?? '',
            year:   e.year   ?? '',
          }))
        })
        setIncludeEducation(prev => prev || true)
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

    // Pre-fill the editable Job Title from the extracted value (don't clobber
    // a user edit already in the field).
    if (jdData?.extracted_job_title) {
      setJobTitle(prev => prev || jdData.extracted_job_title || '')
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

  // Background alignment fetch when entering building step
  useEffect(() => {
    if (step !== 'building') return
    if (!jdData?.jd_id || selectedIds.length === 0) return
    if (alignmentSuggestions.length > 0 || alignmentMatched.length > 0 || alignmentLoading) return
    setAlignmentLoading(true)
    setAlignmentError(null)
    fetch('/api/theme-alignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: selectedIds, jd_id: jdData.jd_id }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.gaps) setAlignmentSuggestions(data.gaps)
        if (data.matched) setAlignmentMatched(data.matched)
      })
      .catch(() => {})
      .finally(() => setAlignmentLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, jdData?.jd_id])

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
      // Step 1: Analyze JD
      const analyzeRes = await fetch('/api/analyze-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: jdText }),
      })
      const analyzeData = await analyzeRes.json()
      if (!analyzeRes.ok) throw new Error(analyzeData.error ?? 'Analysis failed')
      setJdData(analyzeData)

      const phrases = analyzeData.extracted_phrases ?? []
      const themes = analyzeData.extracted_themes ?? []
      setConfirmedPhrases(phrases)
      setConfirmedThemes(themes)

      // Step 2: Auto-confirm keywords (no manual confirmation step)
      await fetch(`/api/job-descriptions/${analyzeData.jd_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extracted_phrases: phrases, extracted_themes: themes }),
      })

      // Step 3: Match modules
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
      setSelectedIds(ranked.filter(m => m.match_score >= 70).map(m => m.module_id))

      const skillModules = ranked.filter(m => m.type === 'skill' && m.match_score >= 70)
      if (skillModules.length > 0) {
        setSkills(skillModules.map(m => m.title))
      }

      setStep('building')
    } catch (e) {
      setErrorMessage((e as Error).message)
      setStep('input')
    }
  }

  // ── Step 1.5: confirm keywords then match (legacy — kept for restoreDraft) ──

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

      setStep('building')
    } catch (e) {
      setErrorMessage((e as Error).message)
    } finally {
      setConfirmLoading(false)
    }
  }

  // ── Step 2.5: theme alignment (manual retry — background fetch runs automatically) ─

  async function handleAlign() {
    setAlignmentLoading(true)
    setAlignmentError(null)
    setAlignmentStates({})
    setAlignmentSuggestions([])
    setAlignmentMatched([])
    setSavedToLibrary(false)
    try {
      const res = await fetch('/api/theme-alignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_ids: selectedIds, jd_id: jdData!.jd_id }),
      })
      const data = await res.json()
      if (res.ok) {
        setAlignmentSuggestions(data.gaps ?? [])
        setAlignmentMatched(data.matched ?? [])
      } else {
        setAlignmentError(data.error ?? 'Theme analysis failed. You can still continue to configure.')
      }
    } catch {
      setAlignmentError('Could not reach the theme analysis service. You can still continue to configure.')
    } finally {
      setAlignmentLoading(false)
    }
  }

  async function handleSaveToLibrary() {
    const accepted = alignmentSuggestions.filter(s => alignmentStates[s.theme] === 'accepted')
    if (accepted.length === 0) return
    setSavingToLibrary(true)
    try {
      await Promise.all(
        accepted.map(s =>
          fetch(`/api/modules/${s.module_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: s.suggestion }),
          })
        )
      )
      setSavedToLibrary(true)
    } finally {
      setSavingToLibrary(false)
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

  // ── Module inline edit ───────────────────────────────────────────────────────

  function startEditModule(m: RankedModule) {
    setEditingModuleId(m.module_id)
    setEditingContent(moduleContentOverrides[m.module_id] ?? m.content)
    setEditSaveToLibrary(false)
    setOpenSuggestion(null)
  }

  async function saveModuleEdit(moduleId: string) {
    const trimmed = editingContent.trim()
    if (!trimmed) return
    setEditSaving(true)
    // Update local override immediately so coverage updates right away
    setModuleContentOverrides(prev => ({ ...prev, [moduleId]: trimmed }))
    if (editSaveToLibrary) {
      try {
        await fetch(`/api/modules/${moduleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: trimmed }),
        })
      } catch (_) { /* silently ignore — local override already applied */ }
    }
    setEditSaving(false)
    setEditingModuleId(null)
  }

  function cancelModuleEdit() {
    setEditingModuleId(null)
    setEditingContent('')
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

  async function handleOverageCheckout() {
    setOverageCheckoutLoading(true)
    try {
      const res = await fetch('/api/checkout/overage', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.url) {
        window.location.href = data.url as string
        return
      }
      setErrorMessage(data.error ?? 'Could not start checkout.')
    } catch {
      setErrorMessage('Could not start checkout.')
    } finally {
      setOverageCheckoutLoading(false)
    }
  }

  async function saveJobTitle() {
    if (!jdData?.jd_id) return
    const trimmed = jobTitle.trim()
    if (trimmed === (jdData.extracted_job_title ?? '')) return
    setJobTitleSaving(true)
    try {
      const res = await fetch(`/api/job-descriptions/${jdData.jd_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extracted_job_title: trimmed }),
      })
      if (res.ok) {
        setJdData(d => d ? { ...d, extracted_job_title: trimmed } : d)
      }
    } finally {
      setJobTitleSaving(false)
    }
  }

  async function handleSuggestSummary() {
    if (!jdData?.jd_id) return
    setSuggestingSummary(true)
    setSuggestError('')
    try {
      const res = await fetch('/api/suggest-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jd_id: jdData.jd_id,
          current_summary: savedSummary || summaryOverride,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to suggest')
      setSuggestedSummary(data.suggested ?? '')
      setSuggestedThemes(Array.isArray(data.themes_used) ? data.themes_used : [])
    } catch (e) {
      setSuggestError((e as Error).message)
    } finally {
      setSuggestingSummary(false)
    }
  }

  function applySuggestion() {
    if (!suggestedSummary) return
    setSummaryOverride(suggestedSummary)
    setEditingSummary(false)
  }

  async function saveSuggestionAsDefault() {
    if (!suggestedSummary) return
    setSavingSummaryDefault(true)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: suggestedSummary }),
      })
      if (res.ok) {
        setSavedSummary(suggestedSummary)
        setSummaryOverride(suggestedSummary)
        setSavedSummaryDefault(true)
        setTimeout(() => setSavedSummaryDefault(false), 2500)
      }
    } finally {
      setSavingSummaryDefault(false)
    }
  }

  // ── Step 4: generate ────────────────────────────────────────────────────────

  async function handleGenerate() {
    setErrorMessage('')
    setShowOveragePrompt(false)

    // Generation is always allowed — free users get a preview, download is gated separately.
    setStep('generating')
    try {
      const orderedIds = rankedModules
        .filter(m => selectedIds.includes(m.module_id))
        .map(m => m.module_id)

      // Merge content overrides (manual edits) + accepted alignment rewrites
      // Accepted alignment suggestions take priority over manual edits
      const moduleAugmentations: Record<string, string> = { ...moduleContentOverrides }
      for (const s of alignmentSuggestions) {
        if (alignmentStates[s.theme] === 'accepted') {
          moduleAugmentations[s.module_id] = s.suggestion
        }
      }
      const hasAugmentations = Object.keys(moduleAugmentations).length > 0

      const res = await fetch('/api/generate-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module_ids: orderedIds,
          jd_id: jdData!.jd_id,
          ...(hasAugmentations && { module_augmentations: moduleAugmentations }),
          positioning_variant: posVariant,
          contact,
          summary_override: summaryOverride || undefined,
          education: includeEducation ? education : [],
          skills: includeSkills ? skills : [],
          awards_text: includeAwards ? awardsText : '',
          include_skills_section: includeSkills,
          include_education_section: includeEducation,
          include_awards_section: includeAwards && !!awardsText.trim(),
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
      if (!res.ok) {
        if (data.code === 'monthly_generation_limit') {
          setShowMonthlyLimitModal(true)
          setStep('configuring')
          return
        }
        throw new Error(data.error ?? 'Generation failed')
      }
      setGeneratedUrls({ docx_url: data.docx_url, pdf_url: data.pdf_url, docx_filename: data.docx_filename ?? 'Resume.docx' })
      setResumeHtml(data.resume_html ?? null)
      setCoverLetterText(data.cover_letter_text ?? null)
      setCoverLetterUrl(data.cover_letter_url ?? null)
      setMatchedKeywords(data.matched_keywords ?? [])
      setMissingKeywords(data.missing_keywords ?? [])
      setAtsScore(data.ats_score ?? null)
      fetch('/api/draft-generation', { method: 'DELETE' }).catch(() => {})
      setDraftRestored(false)
      setStep('done')
    } catch (e) {
      setErrorMessage((e as Error).message)
      setStep('configuring')
    }
  }

  function reset() {
    fetch('/api/draft-generation', { method: 'DELETE' }).catch(() => {})
    setDraftRestored(false)
    setHasDraft(false)
    setStep('input')
    setEditingSummary(false)
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
    setAlignmentSuggestions([])
    setAlignmentMatched([])
    setAlignmentStates({})
    setAlignmentLoading(false)
    setAlignmentError(null)
    setSavingToLibrary(false)
    setSavedToLibrary(false)
    setShowOveragePrompt(false)
    setOverageCheckoutLoading(false)
    setIncludeAwards(false)
    setAwardsText('')
    setModuleContentOverrides({})
    setEditingModuleId(null)
    setEditingContent('')
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
          {step === 'building' && (
            <>
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setStep('input')}>← Back</button>
              <button className="btn-primary" onClick={() => setStep('configuring')} disabled={selectedIds.length === 0}>
                Continue →
              </button>
            </>
          )}
          {step === 'configuring' && (
            <>
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setStep('building')}>← Back</button>
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
                onClick={() => setStep('building')}
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
                      onClick={e => {
                        e.stopPropagation()
                        setShowDownloadMenu(false)
                        downloadFile(generatedUrls.docx_url, generatedUrls.docx_filename)
                      }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg3)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      📄 Word (.docx)
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        setShowDownloadMenu(false)
                        downloadFile(generatedUrls.pdf_url, generatedUrls.docx_filename.replace('.docx', '.pdf'))
                      }}
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

          {/* Resume draft banner */}
          {hasDraft && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--teal-dim)', border: '1px solid var(--teal-glow)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)', marginBottom: 2 }}>You have an unfinished resume</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>Pick up where you left off, or start fresh with a new job description.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    fetch('/api/draft-generation').then(r => r.json()).then(({ draft }) => {
                      if (draft) {
                        const stepMap: Record<string, Step> = {
                          confirming: 'building', selecting: 'building', aligning: 'building',
                        }
                        const rawStep = draft.step as string
                        const mapped: Step = stepMap[rawStep] ?? rawStep as Step
                        const safeStep: Step = mapped === 'done' || mapped === 'generating' ? 'configuring' : mapped
                        restoreDraft(draft, safeStep)
                      }
                    })
                  }}
                >
                  Resume draft
                </button>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', lineHeight: 1, padding: '0 2px' }}
                  onClick={() => { setHasDraft(false); fetch('/api/draft-generation', { method: 'DELETE' }).catch(() => {}) }}
                  aria-label="Dismiss"
                >×</button>
              </div>
            </div>
          )}

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

      {/* ── BUILDING ──────────────────────────────────────────────────────── */}
      {step === 'building' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left: JD Intelligence panel */}
          <div style={{
            width: 280,
            flexShrink: 0,
            borderRight: '1px solid var(--border2)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '24px 20px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>JD Intelligence</div>

            {/* Job info */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>{jdData?.extracted_company ?? '—'}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{jdData?.extracted_role_type ?? ''}</div>
              {jdData?.extracted_seniority && (
                <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 600, color: 'var(--teal)', background: 'var(--teal-dim)', border: '1px solid var(--teal-glow)', borderRadius: 999, padding: '2px 8px', letterSpacing: '0.04em' }}>
                  {jdData.extracted_seniority}
                </span>
              )}
            </div>

            {/* Coverage meter */}
            {confirmedThemes.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Theme coverage</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: coveredThemes.size > 0 ? 'var(--teal)' : 'var(--text3)' }}>
                    {coveredThemes.size}/{confirmedThemes.length}
                  </div>
                </div>
                <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${confirmedThemes.length > 0 ? Math.round((coveredThemes.size / confirmedThemes.length) * 100) : 0}%`,
                    background: 'var(--teal)',
                    borderRadius: 999,
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            )}

            {/* Theme pills */}
            {confirmedThemes.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Themes</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {confirmedThemes.map(t => {
                    const covered = coveredThemes.has(t)
                    return (
                      <span key={t} style={{
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 999,
                        padding: '3px 9px',
                        border: covered ? '1px solid var(--teal-glow)' : '1px dashed var(--border2)',
                        background: covered ? 'var(--teal-dim)' : 'transparent',
                        color: covered ? 'var(--teal)' : 'var(--text3)',
                      }}>
                        {t}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Estimated ATS score */}
            {estimatedAtsScore !== null && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Est. ATS Match</div>
                  <div style={{
                    fontSize: 12, fontWeight: 700,
                    color: estimatedAtsScore >= 85 ? 'var(--teal)' : estimatedAtsScore >= 75 ? '#4ade80' : estimatedAtsScore >= 60 ? '#eab308' : '#ef4444',
                  }}>
                    {estimatedAtsScore}
                  </div>
                </div>
                <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${estimatedAtsScore}%`,
                    background: estimatedAtsScore >= 85 ? 'var(--teal)' : estimatedAtsScore >= 75 ? '#4ade80' : estimatedAtsScore >= 60 ? '#eab308' : '#ef4444',
                    borderRadius: 999,
                    transition: 'width 0.3s',
                  }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                  {estimatedAtsScore >= 75 ? '✓ Above interview threshold' : 'Cover more phrases to reach 75+'}
                </div>
              </div>
            )}

            {/* Job title coverage check */}
            {jdData?.extracted_job_title && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Job title match</div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '6px 10px', borderRadius: 7,
                  background: jobTitleCovered ? 'var(--teal-dim)' : 'oklch(0.4 0.13 60 / 0.1)',
                  border: `1px solid ${jobTitleCovered ? 'var(--teal-glow)' : 'oklch(0.65 0.14 60 / 0.4)'}`,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: jobTitleCovered ? 'var(--teal)' : 'oklch(0.75 0.16 60)', flex: 1, lineHeight: 1.3 }}>
                    {jdData.extracted_job_title}
                  </span>
                  <span style={{ fontSize: 13, flexShrink: 0 }}>{jobTitleCovered ? '✓' : '!'}</span>
                </div>
                {!jobTitleCovered && (
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 5, lineHeight: 1.4 }}>
                    Resumes with the job title get 10× more interviews. Add it to a module or your summary.
                  </div>
                )}
              </div>
            )}

            {/* Consider adding — missing phrases */}
            {missingPhrases.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Consider adding</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {missingPhrases.map(p => (
                    <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid var(--border2)' }}>
                      <div style={{ width: 6, height: 6, borderRadius: 999, border: '1.5px solid oklch(0.65 0.14 60 / 0.6)', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: 'var(--text2)', flex: 1, lineHeight: 1.3 }}>{p}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6, lineHeight: 1.4 }}>
                  Edit a module to weave these in — coverage updates live.
                </div>
              </div>
            )}

            {/* Key phrases */}
            {confirmedPhrases.length > 0 && missingPhrases.length === 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Key phrases</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {confirmedPhrases.map(p => (
                    <div key={p} style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4 }}>· {p}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Alignment status indicator */}
            {alignmentLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                <Spinner />
                <span>Analyzing coverage…</span>
              </div>
            )}
          </div>

          {/* Right: Module library grouped by job */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

            {modulesByJob.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)', fontSize: 13 }}>
                No modules matched. Try adjusting your job description.
              </div>
            )}

            {modulesByJob.map(group => {
              const groupKey = `${group.company}||${group.role}`
              const isCollapsed = collapsedJobs[groupKey] ?? false
              const selectedInGroup = group.modules.filter(m => selectedIds.includes(m.module_id)).length

              return (
                <div key={groupKey} style={{ marginBottom: 24 }}>
                  {/* Job section header */}
                  <button
                    onClick={() => setCollapsedJobs(prev => ({ ...prev, [groupKey]: !isCollapsed }))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '6px 0',
                      textAlign: 'left',
                      borderBottom: '1px solid var(--border2)',
                      marginBottom: 10,
                    }}
                  >
                    <svg
                      width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="var(--text3)" strokeWidth="1.6"
                      style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
                    >
                      <path d="M1 2l4 4 4-4" />
                    </svg>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{group.company}</span>
                      {group.role && <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>{group.role}</span>}
                      {group.dates && <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8, fontFamily: 'var(--mono)' }}>{group.dates}</span>}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{selectedInGroup}/{group.modules.length}</span>
                  </button>

                  {!isCollapsed && group.modules.map(m => {
                    const on = selectedIds.includes(m.module_id)
                    const suggestion = alignmentSuggestions.find(s => s.module_id === m.module_id)
                    const hasSuggestion = !!suggestion && on
                    const suggestionOpen = openSuggestion === m.module_id
                    const isEditing = editingModuleId === m.module_id
                    const effectiveContent = moduleContentOverrides[m.module_id] ?? m.content
                    const isOverridden = !!moduleContentOverrides[m.module_id]
                    // Uncovered themes for this module — show as edit hints
                    const allThemes = confirmedThemes.length > 0 ? confirmedThemes : (jdData?.extracted_themes ?? [])
                    const uncoveredForModule = allThemes.filter(t => !coveredThemes.has(t))

                    return (
                      <div
                        key={m.module_id}
                        style={{
                          background: 'var(--surface)',
                          border: `1px solid ${isEditing ? 'var(--teal-glow)' : hasSuggestion ? 'oklch(0.65 0.14 60 / 0.4)' : 'var(--border2)'}`,
                          borderRadius: 10,
                          marginBottom: 8,
                          opacity: on ? 1 : 0.5,
                          transition: 'opacity 0.15s, border-color 0.15s',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Module header row */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px' }}>
                          <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, flexShrink: 0, background: m.weight === 'anchor' ? 'var(--teal)' : m.weight === 'strong' ? 'var(--indigo)' : 'var(--amber)' }} />

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{m.title}</div>
                              {isOverridden && !isEditing && (
                                <span style={{ fontSize: 10, color: 'var(--teal)', background: 'var(--teal-dim)', border: '1px solid var(--teal-glow)', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>edited</span>
                              )}
                            </div>

                            {/* Content: full text when not editing */}
                            {!isEditing && (
                              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                {effectiveContent}
                              </div>
                            )}

                            {/* Theme tags */}
                            {!isEditing && m.themes && m.themes.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                {m.themes.map(t => (
                                  <span key={t} style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    borderRadius: 999,
                                    padding: '1px 7px',
                                    background: coveredThemes.has(t) && on ? 'var(--teal-dim)' : 'var(--bg3)',
                                    color: coveredThemes.has(t) && on ? 'var(--teal)' : 'var(--text3)',
                                    border: coveredThemes.has(t) && on ? '1px solid var(--teal-glow)' : '1px solid transparent',
                                  }}>
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            {m.match_score > 0 && !isEditing && (
                              <span className={`mod-score ${scoreClass(m.match_score)}`}>{m.match_score}%</span>
                            )}
                            {hasSuggestion && !isEditing && (
                              <button
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  background: alignmentStates[suggestion.theme] === 'accepted' ? 'var(--teal-dim)' : 'oklch(0.4 0.13 60 / 0.18)',
                                  border: alignmentStates[suggestion.theme] === 'accepted' ? '1px solid var(--teal-glow)' : '1px solid oklch(0.65 0.14 60 / 0.5)',
                                  color: alignmentStates[suggestion.theme] === 'accepted' ? 'var(--teal)' : 'oklch(0.75 0.16 60)',
                                  borderRadius: 4,
                                  padding: '2px 7px',
                                  cursor: 'pointer',
                                  fontFamily: 'var(--font)',
                                }}
                                onClick={() => setOpenSuggestion(suggestionOpen ? null : m.module_id)}
                              >
                                {alignmentStates[suggestion.theme] === 'accepted' ? '✓ rewritten' : 'gap'}
                              </button>
                            )}
                            {!isEditing && (
                              <button
                                onClick={() => startEditModule(m)}
                                style={{
                                  fontSize: 11,
                                  fontWeight: 500,
                                  background: 'none',
                                  border: '1px solid var(--border2)',
                                  borderRadius: 5,
                                  padding: '2px 8px',
                                  color: 'var(--text3)',
                                  cursor: 'pointer',
                                  fontFamily: 'var(--font)',
                                }}
                              >
                                Edit
                              </button>
                            )}
                            {!isEditing && (
                              <button
                                className={`mod-toggle ${on ? '' : 'off'}`}
                                onClick={() => toggleModule(m.module_id)}
                                aria-label={`Toggle ${m.title}`}
                              />
                            )}
                          </div>
                        </div>

                        {/* Inline edit panel */}
                        {isEditing && (
                          <div style={{ borderTop: '1px solid var(--teal-glow)', padding: '12px 14px', background: 'var(--bg2)' }}>
                            {/* Gap theme hints */}
                            {uncoveredForModule.length > 0 && (
                              <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                  Weave in to cover gaps
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {uncoveredForModule.map(t => (
                                    <button
                                      key={t}
                                      onClick={() => setEditingContent(c => c.trimEnd() + ' ' + t)}
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 600,
                                        borderRadius: 999,
                                        padding: '2px 8px',
                                        background: 'oklch(0.4 0.13 60 / 0.12)',
                                        border: '1px dashed oklch(0.65 0.14 60 / 0.5)',
                                        color: 'oklch(0.75 0.16 60)',
                                        cursor: 'pointer',
                                        fontFamily: 'var(--font)',
                                      }}
                                    >
                                      + {t}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Textarea */}
                            <textarea
                              value={editingContent}
                              onChange={e => setEditingContent(e.target.value)}
                              rows={6}
                              style={{
                                width: '100%',
                                fontSize: 12,
                                lineHeight: 1.55,
                                color: 'var(--text)',
                                background: 'var(--surface)',
                                border: '1px solid var(--teal-glow)',
                                borderRadius: 6,
                                padding: '8px 10px',
                                resize: 'vertical',
                                fontFamily: 'var(--font)',
                                boxSizing: 'border-box',
                                outline: 'none',
                              }}
                              autoFocus
                            />

                            {/* Save options */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text3)', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={editSaveToLibrary}
                                  onChange={e => setEditSaveToLibrary(e.target.checked)}
                                  style={{ accentColor: 'var(--teal)', cursor: 'pointer' }}
                                />
                                Save changes to my module library
                              </label>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn-ghost" style={{ fontSize: 11 }} onClick={cancelModuleEdit}>
                                  Cancel
                                </button>
                                <button
                                  className="btn-primary"
                                  style={{ fontSize: 11 }}
                                  onClick={() => saveModuleEdit(m.module_id)}
                                  disabled={editSaving}
                                >
                                  {editSaving ? 'Saving…' : 'Save'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Inline suggestion panel */}
                        {hasSuggestion && suggestionOpen && !isEditing && (
                          <div style={{ borderTop: '1px solid var(--border2)', padding: '12px 14px', background: 'var(--bg2)' }}>
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
                              Theme gap: <strong style={{ color: 'oklch(0.75 0.16 60)' }}>{suggestion.theme}</strong>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--teal)', marginBottom: 3 }}>Suggested rewrite</div>
                            <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55, background: 'var(--teal-dim)', border: '1px solid var(--teal-glow)', padding: '7px 12px', borderRadius: 6, marginBottom: 10 }}>
                              {suggestion.suggestion}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                className="btn-ghost"
                                style={{ fontSize: 11 }}
                                onClick={() => { setAlignmentStates(prev => ({ ...prev, [suggestion.theme]: 'skipped' })); setOpenSuggestion(null) }}
                              >
                                Skip
                              </button>
                              <button
                                className="btn-primary"
                                style={{ fontSize: 11 }}
                                onClick={() => {
                                  setAlignmentStates(prev => ({ ...prev, [suggestion.theme]: 'accepted' }))
                                  // Apply the rewrite as a content override
                                  setModuleContentOverrides(prev => ({ ...prev, [m.module_id]: suggestion.suggestion }))
                                  setOpenSuggestion(null)
                                }}
                              >
                                Accept rewrite
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Add more from library */}
            {unmatchedModules.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 12, marginBottom: 10 }}
                  onClick={() => setShowUnmatched(v => !v)}
                >
                  {showUnmatched ? '▾' : '▸'} Add more from library ({unmatchedModules.length})
                </button>
                {showUnmatched && unmatchedModules.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 14px', marginBottom: 6, opacity: 0.7 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text)' }}>{m.title}</div>
                      {m.source_company && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.source_company}</div>}
                    </div>
                    <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => addUnmatched(m)}>+ Add</button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Sections: Education + Skills ── */}
            <div style={{ marginTop: 32, borderTop: '1px solid var(--border2)', paddingTop: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Additional sections</div>

              {/* Education */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Education</div>
                  <button className={`mod-toggle ${includeEducation ? '' : 'off'}`} onClick={() => setIncludeEducation(v => !v)} aria-label="Toggle education" />
                </div>
                {includeEducation && education.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', paddingBottom: 8 }}>
                    No education entries found. Add them in <a href="/my-info" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>My Info</a>.
                  </div>
                )}
                {includeEducation && education.map((e, i) => (
                  <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 14px', marginBottom: 6 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>School</div>
                        <input className="mod-edit-input" style={{ fontSize: 12 }} value={e.school} onChange={ev => setEducation(ed => ed.map((x, j) => j === i ? { ...x, school: ev.target.value } : x))} placeholder="University name" />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>Degree</div>
                        <input className="mod-edit-input" style={{ fontSize: 12 }} value={e.degree} onChange={ev => setEducation(ed => ed.map((x, j) => j === i ? { ...x, degree: ev.target.value } : x))} placeholder="B.S., M.A., etc." />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>Field</div>
                        <input className="mod-edit-input" style={{ fontSize: 12 }} value={e.field} onChange={ev => setEducation(ed => ed.map((x, j) => j === i ? { ...x, field: ev.target.value } : x))} placeholder="Computer Science" />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>Year</div>
                        <input className="mod-edit-input" style={{ fontSize: 12 }} value={e.year} onChange={ev => setEducation(ed => ed.map((x, j) => j === i ? { ...x, year: ev.target.value } : x))} placeholder="2018" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Skills */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Skills section</div>
                  <button className={`mod-toggle ${includeSkills ? '' : 'off'}`} onClick={() => setIncludeSkills(v => !v)} aria-label="Toggle skills" />
                </div>
                {includeSkills && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px', background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, alignItems: 'center', minHeight: 42 }}>
                    {skills.map(s => (
                      <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 999, padding: '3px 10px', fontSize: 12, color: 'var(--text)' }}>
                        {s}
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }} onClick={() => setSkills(ss => ss.filter(x => x !== s))}>×</button>
                      </span>
                    ))}
                    <input
                      className="mod-edit-input"
                      style={{ border: 'none', background: 'none', padding: '0 4px', fontSize: 12, minWidth: 100, flex: 1, outline: 'none' }}
                      placeholder="Add skill…"
                      value={skillInput}
                      onChange={e => setSkillInput(e.target.value)}
                      onKeyDown={onSkillKeyDown}
                      onBlur={() => { if (skillInput.trim()) addSkill(skillInput) }}
                    />
                  </div>
                )}
              </div>
            </div>
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

            {/* Overage prompt — free plan, monthly resume limit reached */}
            {showOveragePrompt && (
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--amber, oklch(0.75 0.16 60))',
                borderRadius: 10,
                padding: '18px 20px',
                marginBottom: 24,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                  You&apos;ve used your 25 free resumes this month.
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>
                  Buy a single resume for $9, a 5-pack for $29, or go unlimited with Pro. Credits never expire.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleOverageCheckout}
                    disabled={overageCheckoutLoading}
                    style={overageCheckoutLoading ? { opacity: 0.7, display: 'inline-flex', alignItems: 'center', gap: 6 } : { display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    {overageCheckoutLoading ? <><Spinner /> Starting checkout…</> : 'Buy single — $9 →'}
                  </button>
                  <a href="/pricing" style={{ fontSize: 13, color: 'var(--teal)', textDecoration: 'none' }}>
                    See all options →
                  </a>
                </div>
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
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>Estimated ATS Match</span>
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

            {/* Job Title — what the resume gets saved as */}
            <div className="config-section">
              <div className="config-section-title" style={{ marginBottom: 4 }}>Job Title</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
                Used as the saved resume name. Pre-filled from the JD; edit if it&apos;s wrong.
              </div>
              <input
                className="mod-edit-input"
                style={{ width: '100%' }}
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                onBlur={saveJobTitle}
                placeholder={jdData?.extracted_job_title || 'e.g. Head of People'}
                maxLength={200}
              />
              {jobTitleSaving && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Saving…</div>
              )}
            </div>

            {/* Format */}
            <div className="config-section">
              <div className="config-section-title" style={{ marginBottom: 12 }}>Format</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {([
                  {
                    key: 'classic' as const,
                    name: 'Classic',
                    desc: 'Centered header · small-caps sections · Times New Roman',
                    atsWarning: false,
                    preview: (
                      <div style={{ border: '0.5px solid #e5e7eb', borderRadius: 5, overflow: 'hidden', background: '#fff', marginTop: 8 }}>
                        <div style={{ textAlign: 'center', padding: '7px 8px 5px', borderBottom: '0.5px solid #e5e7eb' }}>
                          <div style={{ fontWeight: 700, fontSize: 9, letterSpacing: '0.05em', color: '#111', fontFamily: 'Georgia, serif' }}>JANE DOE</div>
                          <div style={{ fontSize: 7, color: '#888', fontFamily: 'Georgia, serif', fontStyle: 'italic', marginTop: 1 }}>Senior Product Manager</div>
                          <div style={{ fontSize: 6.5, color: '#aaa', marginTop: 1 }}>email · phone · location</div>
                        </div>
                        <div style={{ padding: '5px 8px' }}>
                          <div style={{ fontSize: 7, fontWeight: 700, fontVariant: 'small-caps', letterSpacing: '0.08em', color: '#222', borderBottom: '0.5px solid #555', paddingBottom: 1, marginBottom: 3 }}>Experience</div>
                          <div style={{ height: 3, borderRadius: 1, background: '#d1d5db', marginBottom: 2, width: '88%' }} />
                          <div style={{ height: 3, borderRadius: 1, background: '#e5e7eb', marginBottom: 2, width: '75%' }} />
                          <div style={{ height: 3, borderRadius: 1, background: '#e5e7eb', width: '82%' }} />
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'tech' as const,
                    name: 'Tech',
                    desc: 'Monospace accents · GitHub-style headers · engineers',
                    atsWarning: false,
                    preview: (
                      <div style={{ border: '0.5px solid #e5e7eb', borderRadius: 5, overflow: 'hidden', background: '#fff', marginTop: 8 }}>
                        <div style={{ padding: '7px 8px 5px', borderBottom: '0.5px solid #e5e7eb' }}>
                          <div style={{ fontWeight: 700, fontSize: 9.5, color: '#111', marginBottom: 1 }}>Jane Doe</div>
                          <div style={{ fontSize: 7, color: '#1d9e75', fontFamily: 'monospace', marginBottom: 1 }}>Senior Software Engineer</div>
                          <div style={{ fontSize: 6.5, color: '#aaa', fontFamily: 'monospace' }}>jane@email.com · github.com/jdoe</div>
                        </div>
                        <div style={{ padding: '5px 8px' }}>
                          <div style={{ fontSize: 7, fontFamily: 'monospace', color: '#1d9e75', fontWeight: 700, marginBottom: 3 }}>## Experience</div>
                          <div style={{ height: 3, borderRadius: 1, background: '#d1d5db', marginBottom: 2, width: '85%' }} />
                          <div style={{ height: 3, borderRadius: 1, background: '#e5e7eb', marginBottom: 2, width: '72%' }} />
                          <div style={{ height: 3, borderRadius: 1, background: '#e5e7eb', width: '80%' }} />
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'combination' as const,
                    name: 'Combination',
                    desc: 'Mauve header · skills-first · then work history',
                    atsWarning: false,
                    preview: (
                      <div style={{ border: '0.5px solid #e5e7eb', borderRadius: 5, overflow: 'hidden', background: '#fff', marginTop: 8 }}>
                        <div style={{ background: '#C49098', padding: '6px 8px', textAlign: 'center' }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>Jane Doe</div>
                          <div style={{ fontSize: 6.5, color: '#F0D8DA', marginTop: 1 }}>Head of Community</div>
                        </div>
                        <div style={{ background: '#EDD5D7', padding: '2px 8px' }}>
                          <div style={{ fontSize: 6.5, fontWeight: 700, color: '#7A4A4E', letterSpacing: '0.06em' }}>RELEVANT SKILLS</div>
                        </div>
                        <div style={{ padding: '4px 8px' }}>
                          <div style={{ height: 3, borderRadius: 1, background: '#e5cdd0', marginBottom: 2, width: '82%' }} />
                          <div style={{ height: 3, borderRadius: 1, background: '#eedfe1', width: '65%' }} />
                          <div style={{ background: '#EDD5D7', padding: '2px 0', margin: '4px -8px', paddingLeft: 8 }}>
                            <div style={{ fontSize: 6.5, fontWeight: 700, color: '#7A4A4E', letterSpacing: '0.06em' }}>WORK EXPERIENCE</div>
                          </div>
                          <div style={{ height: 3, borderRadius: 1, background: '#d1d5db', marginTop: 3, width: '78%' }} />
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'executive' as const,
                    name: 'Executive',
                    desc: 'Dark header · ruled sections · VP and C-suite',
                    atsWarning: false,
                    preview: (
                      <div style={{ border: '0.5px solid #e5e7eb', borderRadius: 5, overflow: 'hidden', background: '#fff', marginTop: 8 }}>
                        <div style={{ background: '#1e293b', padding: '8px 9px 6px' }}>
                          <div style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', letterSpacing: '0.01em' }}>Jane Doe</div>
                          <div style={{ fontSize: 7, color: '#94a3b8', marginTop: 1 }}>Chief People Officer</div>
                          <div style={{ fontSize: 6.5, color: '#475569', marginTop: 1 }}>email · phone · linkedin</div>
                        </div>
                        <div style={{ padding: '5px 9px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            <div style={{ width: 10, height: 0.5, background: '#1e293b', flexShrink: 0 }} />
                            <div style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: '0.08em', color: '#1e293b', textTransform: 'uppercase' }}>Experience</div>
                            <div style={{ flex: 1, height: 0.5, background: '#e5e7eb' }} />
                          </div>
                          <div style={{ height: 3, borderRadius: 1, background: '#d1d5db', marginBottom: 2, width: '88%' }} />
                          <div style={{ height: 3, borderRadius: 1, background: '#e5e7eb', marginBottom: 2, width: '74%' }} />
                          <div style={{ height: 3, borderRadius: 1, background: '#e5e7eb', width: '82%' }} />
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'minimal' as const,
                    name: 'Minimal',
                    desc: 'Maximum whitespace · no decoration · design & creative',
                    atsWarning: false,
                    preview: (
                      <div style={{ border: '0.5px solid #e5e7eb', borderRadius: 5, overflow: 'hidden', background: '#fff', marginTop: 8 }}>
                        <div style={{ padding: '9px 9px 6px' }}>
                          <div style={{ fontSize: 10, fontWeight: 500, color: '#111', letterSpacing: '-0.02em' }}>Jane Doe</div>
                          <div style={{ fontSize: 6.5, color: '#aaa', marginTop: 2, letterSpacing: '0.01em' }}>Product Designer · SF</div>
                          <div style={{ height: 0.5, background: '#e5e7eb', margin: '6px 0' }} />
                          <div style={{ fontSize: 6.5, color: '#ccc', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Experience</div>
                          <div style={{ height: 3, borderRadius: 1, background: '#e5e7eb', marginBottom: 2, width: '85%' }} />
                          <div style={{ height: 3, borderRadius: 1, background: '#f0f0f0', marginBottom: 2, width: '72%' }} />
                          <div style={{ height: 3, borderRadius: 1, background: '#f0f0f0', width: '80%' }} />
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'two-column' as const,
                    name: 'Two-column',
                    desc: 'Sidebar layout · PDF only · best for direct email or portfolio link',
                    atsWarning: true,
                    preview: (
                      <div style={{ border: '0.5px solid #e5e7eb', borderRadius: 5, overflow: 'hidden', background: '#fff', marginTop: 8, display: 'flex', height: 80 }}>
                        <div style={{ width: '34%', background: '#f8fafc', borderRight: '0.5px solid #e5e7eb', padding: '6px 5px', flexShrink: 0 }}>
                          <div style={{ fontSize: 7.5, fontWeight: 700, color: '#111', marginBottom: 1 }}>Jane Doe</div>
                          <div style={{ fontSize: 6, color: '#aaa', marginBottom: 5 }}>Product Lead</div>
                          <div style={{ fontSize: 6, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Skills</div>
                          <div style={{ height: 2.5, borderRadius: 1, background: '#cbd5e1', marginBottom: 2, width: '80%' }} />
                          <div style={{ height: 2.5, borderRadius: 1, background: '#e2e8f0', marginBottom: 2, width: '60%' }} />
                        </div>
                        <div style={{ flex: 1, padding: '6px 6px' }}>
                          <div style={{ fontSize: 6, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Experience</div>
                          <div style={{ height: 2.5, borderRadius: 1, background: '#d1d5db', marginBottom: 2, width: '90%' }} />
                          <div style={{ height: 2.5, borderRadius: 1, background: '#e5e7eb', marginBottom: 2, width: '78%' }} />
                          <div style={{ height: 2.5, borderRadius: 1, background: '#e5e7eb', marginBottom: 5, width: '85%' }} />
                          <div style={{ height: 2.5, borderRadius: 1, background: '#d1d5db', marginBottom: 2, width: '82%' }} />
                          <div style={{ height: 2.5, borderRadius: 1, background: '#e5e7eb', width: '70%' }} />
                        </div>
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
                      border: `1px solid ${resumeFormat === f.key ? 'var(--teal-glow)' : f.atsWarning ? 'oklch(0.65 0.14 60 / 0.4)' : 'var(--border2)'}`,
                      borderRadius: 8,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onClick={() => setResumeFormat(f.key)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="radio" name="format" value={f.key} checked={resumeFormat === f.key} onChange={() => setResumeFormat(f.key)} style={{ accentColor: 'var(--teal)', flexShrink: 0 }} />
                      <div style={{ fontWeight: 600, fontSize: 13, color: resumeFormat === f.key ? 'var(--teal)' : 'var(--text)', flex: 1 }}>{f.name}</div>
                      {f.atsWarning && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'oklch(0.75 0.16 60)', background: 'oklch(0.4 0.13 60 / 0.12)', border: '1px solid oklch(0.65 0.14 60 / 0.4)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                          PDF only
                        </span>
                      )}
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
                <div style={{ marginTop: 12 }}>
                  <label style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 6, display: 'block' }}>
                    Pre-filled from your saved profile summary. Edit for this resume only, clear it to let the AI generate one, or update it permanently in My Info.
                  </label>

                  {/* Side-by-side: Saved (left) vs Suggested (right) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'stretch' }}>
                    {/* LEFT: editable current summary */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        {savedSummary && summaryOverride === savedSummary ? 'Your saved summary' : 'For this resume'}
                      </div>
                      {editingSummary || !summaryOverride ? (
                        <textarea
                          autoFocus={editingSummary}
                          className="mod-edit-textarea"
                          rows={6}
                          value={summaryOverride}
                          onChange={e => setSummaryOverride(e.target.value)}
                          placeholder="2–4 sentences about who you are and the kind of work you do…"
                          style={{ minHeight: 130 }}
                          onBlur={() => { if (summaryOverride.trim()) setEditingSummary(false) }}
                        />
                      ) : (
                        <div style={{ position: 'relative', minHeight: 130, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
                          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap', margin: 0, paddingRight: 28 }}>
                            {summaryOverride}
                          </p>
                          <button
                            type="button"
                            onClick={() => setEditingSummary(true)}
                            title="Edit summary"
                            style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, borderRadius: 4 }}
                          >
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M9 2l2 2-6 6H3V8l6-6z"/>
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* RIGHT: suggested */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          Tailored to this JD
                        </div>
                        <button
                          type="button"
                          onClick={handleSuggestSummary}
                          disabled={!jdData?.jd_id || suggestingSummary}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--teal)',
                            color: 'var(--teal)',
                            fontSize: 11,
                            padding: '3px 10px',
                            borderRadius: 4,
                            cursor: jdData?.jd_id && !suggestingSummary ? 'pointer' : 'not-allowed',
                            opacity: jdData?.jd_id && !suggestingSummary ? 1 : 0.5,
                          }}
                        >
                          {suggestingSummary ? 'Generating…' : suggestedSummary ? 'Regenerate' : 'Suggest'}
                        </button>
                      </div>
                      <div
                        style={{
                          minHeight: 130,
                          background: 'var(--bg3)',
                          border: '1px solid var(--border2)',
                          borderRadius: 6,
                          padding: '10px 12px',
                          fontSize: 13,
                          lineHeight: 1.5,
                          color: suggestedSummary ? 'var(--text)' : 'var(--text3)',
                          fontStyle: suggestedSummary ? 'normal' : 'italic',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {suggestedSummary || (suggestError ? `Error: ${suggestError}` : 'Click Suggest to generate a summary tuned to this JD.')}
                      </div>

                      {suggestedSummary && suggestedThemes.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                          <div style={{ fontSize: 10, color: 'var(--text3)', alignSelf: 'center', marginRight: 4 }}>Pulled in:</div>
                          {suggestedThemes.map(t => (
                            <span key={t} style={{ fontSize: 10, padding: '2px 6px', background: 'var(--teal-dim)', border: '1px solid var(--teal-glow)', color: 'var(--teal)', borderRadius: 3 }}>
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      {suggestedSummary && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                          <button
                            type="button"
                            onClick={applySuggestion}
                            style={{ background: 'var(--teal)', border: 'none', color: 'var(--bg)', fontSize: 11, padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                          >
                            Use this →
                          </button>
                          <button
                            type="button"
                            onClick={saveSuggestionAsDefault}
                            disabled={savingSummaryDefault}
                            style={{ background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text2)', fontSize: 11, padding: '4px 10px', borderRadius: 4, cursor: savingSummaryDefault ? 'not-allowed' : 'pointer' }}
                          >
                            {savingSummaryDefault ? 'Saving…' : savedSummaryDefault ? 'Saved as default ✓' : 'Save as my default'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
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

            {/* Awards & Certifications */}
            <div className="config-section">
              <div className="config-section-header">
                <div className="config-section-title">Awards &amp; Certifications</div>
                <button className={`mod-toggle ${includeAwards ? '' : 'off'}`} onClick={() => setIncludeAwards(v => !v)} aria-label="Toggle awards" />
              </div>
              {includeAwards && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
                    List awards, certifications, or honors — one per line or comma-separated.
                  </div>
                  <textarea
                    className="mod-edit-textarea"
                    rows={4}
                    placeholder="e.g. AWS Certified Solutions Architect, 2023&#10;Community Leader of the Year, SXSW 2022"
                    value={awardsText}
                    onChange={e => setAwardsText(e.target.value)}
                    style={{ minHeight: 90 }}
                  />
                </div>
              )}
            </div>

            {/* Target level */}
            <div className="config-section">
              <div className="config-section-title" style={{ marginBottom: 12 }}>Target level</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(['Junior', 'Mid-level', 'Senior', 'Staff', 'Principal', 'Lead', 'Associate', 'Manager', 'Senior Manager', 'Director', 'VP', 'Executive'] as const).map(level => (
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
        // Use server-returned matched/missing arrays (fuzzy word-level matching)
        const matchedKw = matchedKeywords
        const missingKw = missingKeywords
        const totalKw = matchedKw.length + missingKw.length
        const VISIBLE_KW = 5
        const displayScore = atsScore ?? (totalKw > 0 ? Math.round((matchedKw.length / totalKw) * 100) : 0)

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text3)' }}>Cover Letter</div>
                    </div>
                    <div style={{ background: '#fff', borderRadius: 6, boxShadow: '0 2px 16px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.06)', padding: '28px 36px', maxHeight: 360, overflowY: 'auto' }}>
                      <pre style={{ fontFamily: 'var(--mono)', fontSize: 12.5, lineHeight: 1.75, color: '#333', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{coverLetterText}</pre>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      {(userTier === 'pro' || userTier === 'beta_pro') ? (
                        coverLetterUrl && (
                          <a href={coverLetterUrl} download className="btn-ghost" style={{ fontSize: 12, textDecoration: 'none' }}>
                            Download cover letter (.txt)
                          </a>
                        )
                      ) : (
                        <div style={{ fontSize: 13, color: 'var(--text2)', padding: '10px 14px', border: '1px solid var(--border2)', borderRadius: 8, background: 'var(--bg2)' }}>
                          Cover letter generated. <a href="/billing" style={{ color: 'var(--teal)' }}>Upgrade to Pro to download →</a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Resume saved indicator */}
                <div style={{ fontSize: 13, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--teal-glow)', background: 'var(--teal-dim)', color: 'var(--teal)', marginBottom: 12 }}>
                  ✓ Resume saved to your library. <a href="/resumes" style={{ color: 'var(--teal)' }}>View in My Resumes →</a>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => setStep('configuring')}>Generate another variant</button>
                  <button className="btn-ghost" style={{ fontSize: 13 }} onClick={reset}>Start over</button>
                </div>
              </div>

              {/* ── RIGHT: score + keywords ── */}
              <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* ATS Score gauge card */}
                {(atsScore != null || totalKw > 0) && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '20px 20px 14px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                      <ScoreGauge score={displayScore} size="md" />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600, marginBottom: 2 }}>ATS Estimator</div>
                    {totalKw > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {matchedKw.length}/{totalKw} keywords · {
                          [contact.name, contact.email, contact.phone, contact.linkedin, contact.location].filter(Boolean).length
                        }/5 contact fields
                      </div>
                    )}
                  </div>
                )}

                {/* Free-tier locked breakdown */}
                {planLoaded && !(userTier === 'pro' || userTier === 'beta_pro') && (matchedKw.length > 0 || missingKw.length > 0) && (
                  <div style={{ background: 'var(--surface)', border: '1px dashed var(--border2)', borderRadius: 10, padding: '16px 18px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, marginBottom: 6 }}>🔒</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Full ATS breakdown is Pro-only</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>Keyword analysis, missing terms, and section scores are unlocked on Pro.</div>
                    <a href="/billing" className="btn-primary" style={{ fontSize: 12, padding: '6px 14px', display: 'inline-block' }}>Upgrade to Pro to see the full breakdown</a>
                  </div>
                )}

                {/* Matched keywords */}
                {(userTier === 'pro' || userTier === 'beta_pro') && matchedKw.length > 0 && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '16px 18px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Ranking well for</div>
                    {matchedKw.slice(0, showAllKeywords ? undefined : VISIBLE_KW).map(k => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border2)' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{k}</span>
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

                {/* Missing keywords — post-generation */}
                {(userTier === 'pro' || userTier === 'beta_pro') && missingKw.length > 0 && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '16px 18px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Still missing</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.5 }}>These JD keywords weren&apos;t found in your generated resume. Regenerate after editing your modules to include them:</div>
                    {missingKw.slice(0, showAllKeywords ? undefined : VISIBLE_KW).map(k => (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border2)' }}>
                        <div style={{ width: 6, height: 6, borderRadius: 999, border: '1.5px solid oklch(0.65 0.14 60 / 0.6)', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{k}</span>
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


      {showMonthlyLimitModal && (
        <div
          onClick={() => setShowMonthlyLimitModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border2)',
              borderRadius: 12, padding: 28, maxWidth: 440, width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>🚀</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
              You&apos;ve used your 25 free resumes this month.
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 22 }}>
              Upgrade to Pro for unlimited resume generations, plus the full ATS Estimator breakdown for every resume you create.
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowMonthlyLimitModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text3)', padding: '8px 12px' }}
              >
                Remind me next month
              </button>
              <a href="/billing" className="btn-primary">Upgrade to Pro →</a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
