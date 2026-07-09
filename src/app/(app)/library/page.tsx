'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient as createSupabaseBrowser } from '@/lib/supabase/client'
import MergeConfirmModal from '@/components/MergeConfirmModal'

// ─── Types ────────────────────────────────────────────────────────────────────
type Job = { id: string; company: string; title: string | null; start_date: string | null; end_date: string | null; location: string | null; employment_type: string | null }
type Module = { id: string; title: string; weight: string | null; themes: string[] | null; type: string | null; source_company: string | null }
type MJA = { module_id: string; job_id: string }
// NB: live schema uses job_id + name (not job_experience_id + skill).
type SkillCategory = 'technical' | 'domain' | 'leadership' | null
type Skill = { id: string; job_id: string; name: string; category: SkillCategory; source: 'user' | 'parsed' }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function moduleColor(m: Module) {
  if (m.weight === 'anchor') return '#1d9e75'
  if (m.weight === 'strong') return '#6366f1'
  const themes = m.themes ?? []
  if (themes.some(t => t.includes('lead') || t.includes('manage'))) return '#6366f1'
  if (themes.some(t => t.includes('data') || t.includes('analyt'))) return '#0ea5e9'
  if (themes.some(t => t.includes('content') || t.includes('writ'))) return '#f97316'
  if (themes.some(t => t.includes('community') || t.includes('devrel'))) return '#1d9e75'
  return '#ba7517'
}

function moduleDomain(m: Module) {
  const r = m.type
  if (r === 'positioning') return 'Career Narrative'
  if (r === 'skill') return 'Skill'
  const themes = m.themes ?? []
  if (themes.some(t => t.includes('community') || t.includes('devrel'))) return 'DevRel'
  if (themes.some(t => t.includes('lead'))) return 'Leadership'
  if (themes.some(t => t.includes('content'))) return 'Content'
  if (themes.some(t => t.includes('data'))) return 'Analytics'
  if (themes.some(t => t.includes('event'))) return 'Events'
  return 'Experience'
}

function Pips({ weight }: { weight: string | null }) {
  const n = weight === 'anchor' ? 5 : weight === 'strong' ? 3 : 2
  const color = weight === 'anchor' ? '#1d9e75' : weight === 'strong' ? '#6366f1' : '#ba7517'
  return (
    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
      {[0,1,2,3,4].map(i => (
        <div key={i} style={{ width: 9, height: 2, borderRadius: 1, background: i < n ? color : 'var(--border2)' }} />
      ))}
    </div>
  )
}

// Inline sparkle (Tabler isn't installed; the page uses inline SVGs throughout).
function SparkleIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M12 2l1.7 6.1a3 3 0 002.2 2.2L22 12l-6.1 1.7a3 3 0 00-2.2 2.2L12 22l-1.7-6.1a3 3 0 00-2.2-2.2L2 12l6.1-1.7a3 3 0 002.2-2.2z" />
    </svg>
  )
}

const SKILL_GROUPS: { key: SkillCategory; label: string }[] = [
  { key: 'technical', label: 'Technical' },
  { key: 'domain', label: 'Domain' },
  { key: 'leadership', label: 'Leadership' },
  { key: null, label: 'General' },
]

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LibraryPage() {
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowser(), [])
  const [jobs, setJobs] = useState<Job[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [mja, setMja] = useState<MJA[]>([])       // module-job assignments
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  // Sync state
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [loadTrigger, setLoadTrigger] = useState(0)

  // Re-parse resume → wipe + rebuild all modules from the latest uploaded resume
  const [reparseState, setReparseState] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle')
  const [reparseMsg, setReparseMsg] = useState('')

  async function handleReparse() {
    setReparseState('loading')
    try {
      const res = await fetch('/api/reparse-my-modules', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Re-parse failed')
      setReparseMsg(`✓ Done — ${data.modules_created} modules rebuilt.`)
      setReparseState('done')
      setLoadTrigger(t => t + 1) // reload the library data
      setTimeout(() => { setReparseState('idle'); setReparseMsg('') }, 4000)
    } catch (e) {
      setReparseMsg((e as Error).message)
      setReparseState('error')
      setTimeout(() => { setReparseState('idle'); setReparseMsg('') }, 5000)
    }
  }

  // Add job form
  const [showAddJob, setShowAddJob] = useState(false)
  const [newCompany, setNewCompany] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDates, setNewDates] = useState('')
  const [savingJob, setSavingJob] = useState(false)

  // Inline job editing
  const [editingJobId, setEditingJobId] = useState<string | null>(null)
  const [editCompany, setEditCompany] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [savingEditJob, setSavingEditJob] = useState(false)
  const [editJobError, setEditJobError] = useState<string | null>(null)

  // Inline job deletion confirm
  const [confirmDeleteJobId, setConfirmDeleteJobId] = useState<string | null>(null)
  const [deletingJob, setDeletingJob] = useState(false)

  // Module edit modal
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null)
  const [editModuleTitle, setEditModuleTitle] = useState('')
  const [editModuleContent, setEditModuleContent] = useState('')
  const [editModuleWeight, setEditModuleWeight] = useState('supporting')
  const [editModuleThemes, setEditModuleThemes] = useState('')
  const [editModuleLoading, setEditModuleLoading] = useState(false)
  const [savingModule, setSavingModule] = useState(false)

  // Add skill
  const [newSkillName, setNewSkillName] = useState('')
  const [savingSkill, setSavingSkill] = useState(false)
  const [addingSkill, setAddingSkill] = useState(false)

  // Skill auto-population
  const [extracting, setExtracting] = useState(false)
  const [skillToast, setSkillToast] = useState('')
  const [armedDeleteSkillId, setArmedDeleteSkillId] = useState<string | null>(null)
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null)
  const [editingSkillName, setEditingSkillName] = useState('')
  // Guards the Escape→blur sequence: Escape sets this so the subsequent blur cancels instead of saving.
  const skillEditCancelRef = useRef(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [skillsOnboardedAt, setSkillsOnboardedAt] = useState<string | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  // Repository
  const [repoSearch, setRepoSearch] = useState('')
  const [repoFilter, setRepoFilter] = useState<'all' | 'anchor' | 'strong' | 'supporting' | 'unassigned'>('all')

  // Merge duplicate job experiences
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeSelected, setMergeSelected] = useState<string[]>([])
  const [mergeConfirm, setMergeConfirm] = useState(false)
  const [mergeToast, setMergeToast] = useState('')

  // ─── Load all data ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true)
      const [jobsRes, modulesRes, mjaRes, skillsRes] = await Promise.all([
        fetch('/api/job-experiences').then(r => r.json()),
        fetch('/api/my-modules').then(r => r.json()),
        fetch('/api/module-job-assignments').then(r => r.json()),
        fetch('/api/job-skills').then(r => r.json()),
      ])
      setJobs(jobsRes.jobs ?? [])
      setModules(modulesRes.modules ?? [])
      setMja(mjaRes.assignments ?? [])
      setSkills(skillsRes.skills ?? [])
      if (jobsRes.jobs?.length > 0) setSelectedJobId(jobsRes.jobs[0].id)

      // Profile flag that gates the skill-onboarding banner.
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        const { data: profile } = await supabase
          .from('users')
          .select('skills_onboarded_at')
          .eq('id', user.id)
          .single()
        setSkillsOnboardedAt(profile?.skills_onboarded_at ?? null)
      }

      setLoading(false)
    }
    load()
  }, [loadTrigger, supabase])

  // ─── Module edit modal actions ──────────────────────────────────────────────
  async function openEditModal(moduleId: string) {
    setEditingModuleId(moduleId)
    setEditModuleLoading(true)
    const res = await fetch(`/api/modules/${moduleId}`)
    const data = await res.json()
    if (data.module) {
      setEditModuleTitle(data.module.title ?? '')
      setEditModuleContent(data.module.content ?? '')
      setEditModuleWeight(data.module.weight ?? 'supporting')
      setEditModuleThemes((data.module.themes ?? []).join(', '))
    }
    setEditModuleLoading(false)
  }

  function closeEditModal() {
    setEditingModuleId(null)
    setEditModuleTitle(''); setEditModuleContent('')
    setEditModuleWeight('supporting'); setEditModuleThemes('')
  }

  async function saveModuleEdit() {
    if (!editingModuleId || savingModule) return
    setSavingModule(true)
    const themes = editModuleThemes.split(',').map(t => t.trim()).filter(Boolean)
    const res = await fetch(`/api/modules/${editingModuleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editModuleTitle, content: editModuleContent, weight: editModuleWeight, themes }),
    })
    if (res.ok) {
      setModules(prev => prev.map(m =>
        m.id === editingModuleId ? { ...m, title: editModuleTitle, weight: editModuleWeight, themes } : m
      ))
      closeEditModal()
    }
    setSavingModule(false)
  }

  // ─── Derived state ──────────────────────────────────────────────────────────
  const selectedJob = jobs.find(j => j.id === selectedJobId) ?? null
  const displayCompany = (company: string) =>
    company?.toLowerCase() === 'self' ? 'Core Skills' : company
  const jobModules = (jobId: string) => modules.filter(m => mja.some(a => a.module_id === m.id && a.job_id === jobId))
  const jobsForModule = (moduleId: string) => jobs.filter(j => mja.some(a => a.module_id === moduleId && a.job_id === j.id))
  const skillsForJob = (jobId: string) => skills.filter(s => s.job_id === jobId)

  const selectedModules = selectedJobId ? jobModules(selectedJobId) : []
  const selectedSkills = selectedJobId ? skillsForJob(selectedJobId) : []

  // Cluster skills by category (technical → domain → leadership → General), dropping empty groups.
  const skillGroups = SKILL_GROUPS
    .map(g => ({ ...g, items: selectedSkills.filter(s => (s.category ?? null) === g.key) }))
    .filter(g => g.items.length > 0)
  const hasParsedSkill = selectedSkills.some(s => s.source === 'parsed')
  const allParsed = selectedSkills.length > 0 && selectedSkills.every(s => s.source === 'parsed')
  const showOnboardBanner = hasParsedSkill && !skillsOnboardedAt && !bannerDismissed

  // Repository filtered modules
  const repoModules = modules.filter(m => {
    const matchSearch = !repoSearch || m.title?.toLowerCase().includes(repoSearch.toLowerCase())
    const matchFilter =
      repoFilter === 'all' ? true :
      repoFilter === 'anchor' ? m.weight === 'anchor' :
      repoFilter === 'strong' ? m.weight === 'strong' :
      repoFilter === 'supporting' ? (m.weight !== 'anchor' && m.weight !== 'strong') :
      repoFilter === 'unassigned' ? !mja.some(a => a.module_id === m.id) : true
    return matchSearch && matchFilter
  })

  // ─── Actions ────────────────────────────────────────────────────────────────
  async function addJob() {
    if (!newCompany.trim()) return
    setSavingJob(true)
    const [start, end] = newDates.includes('–') ? newDates.split('–').map(s => s.trim()) : [newDates.trim(), null]
    const res = await fetch('/api/job-experiences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: newCompany, title: newTitle, start_date: start, end_date: end }),
    })
    const data = await res.json()
    if (data.job) {
      setJobs(prev => [data.job, ...prev])
      setSelectedJobId(data.job.id)
      setShowAddJob(false)
      setNewCompany(''); setNewTitle(''); setNewDates('')
    }
    setSavingJob(false)
  }

  async function assignModuleToJob(moduleId: string, jobId: string) {
    setMja(prev => [...prev, { module_id: moduleId, job_id: jobId }])
    await fetch('/api/module-job-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_id: moduleId, job_id: jobId }),
    })
  }

  async function unassignModuleFromJob(moduleId: string, jobId: string) {
    setMja(prev => prev.filter(a => !(a.module_id === moduleId && a.job_id === jobId)))
    await fetch('/api/module-job-assignments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_id: moduleId, job_id: jobId }),
    })
  }

  async function addSkill(name: string) {
    if (!name.trim() || !selectedJobId) return
    setSavingSkill(true)
    const res = await fetch('/api/job-skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: selectedJobId, name }),
    })
    const data = await res.json()
    if (data.skill) {
      setSkills(prev => [...prev, data.skill])
      setNewSkillName('')
      setAddingSkill(false)
    }
    setSavingSkill(false)
  }

  async function deleteSkill(skillId: string) {
    setSkills(prev => prev.filter(s => s.id !== skillId))
    setArmedDeleteSkillId(prev => (prev === skillId ? null : prev))
    await fetch(`/api/job-skills/${skillId}`, { method: 'DELETE' })
  }

  // Extract skills from this job's modules (existing users, no full reparse).
  async function extractSkills() {
    if (!selectedJobId || extracting) return
    setExtracting(true)
    try {
      const res = await fetch('/api/extract-skills-from-modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_experience_id: selectedJobId }),
      })
      if (res.ok) {
        const skillsRes = await fetch('/api/job-skills').then(r => r.json())
        setSkills(skillsRes.skills ?? [])
        setSkillToast('Skills extracted — review and confirm them below.')
        setTimeout(() => setSkillToast(''), 4000)
      }
    } finally {
      setExtracting(false)
    }
  }

  // Promote an AI-suggested skill to confirmed (RLS lets a user update their own rows).
  async function confirmSkill(skill: Skill) {
    setSkills(prev => prev.map(s => (s.id === skill.id ? { ...s, source: 'user' } : s)))
    await supabase.from('job_skills').update({ source: 'user' }).eq('id', skill.id)
  }

  // Inline rename of a confirmed skill (source='user' only).
  function startEditSkill(skill: Skill) {
    skillEditCancelRef.current = false
    setArmedDeleteSkillId(null)
    setEditingSkillId(skill.id)
    setEditingSkillName(skill.name)
  }

  async function saveSkillRename(skillId: string) {
    if (skillEditCancelRef.current) { skillEditCancelRef.current = false; return }
    const original = skills.find(s => s.id === skillId)?.name ?? ''
    const next = editingSkillName.trim()
    setEditingSkillId(null)
    if (!next || next === original) return
    // Optimistic local update, revert on error.
    setSkills(prev => prev.map(s => (s.id === skillId ? { ...s, name: next } : s)))
    const { error } = await supabase.from('job_skills').update({ name: next }).eq('id', skillId)
    if (error) setSkills(prev => prev.map(s => (s.id === skillId ? { ...s, name: original } : s)))
  }

  async function dismissOnboardBanner() {
    setBannerDismissed(true)
    if (!userId) return
    const now = new Date().toISOString()
    setSkillsOnboardedAt(now)
    await supabase.from('users').update({ skills_onboarded_at: now }).eq('id', userId)
  }

  function startEditJob(job: Job) {
    setEditingJobId(job.id)
    setEditCompany(job.company)
    setEditTitle(job.title ?? '')
    setEditStartDate(job.start_date ?? '')
    setEditEndDate(job.end_date ?? '')
    setEditLocation(job.location ?? '')
  }

  async function saveEditJob() {
    if (!editingJobId) return
    setSavingEditJob(true)
    setEditJobError(null)
    try {
      const res = await fetch(`/api/job-experiences/${editingJobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: editCompany,
          title: editTitle || null,
          start_date: editStartDate || null,
          end_date: editEndDate || null,
          location: editLocation || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setEditJobError(data.error ?? 'Could not save changes.')
        return
      }
      if (data.job) {
        setJobs(prev => prev.map(j => j.id === editingJobId ? data.job : j))
        setEditingJobId(null)
        setEditJobError(null)
      }
    } catch {
      setEditJobError('Could not save changes. Please try again.')
    } finally {
      setSavingEditJob(false)
    }
  }

  // ── Merge duplicate job experiences ─────────────────────────────────────────
  function exitMergeMode() {
    setMergeMode(false)
    setMergeSelected([])
    setMergeConfirm(false)
  }

  function toggleMergeSelect(id: string) {
    setMergeSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id])
  }

  function openMergeConfirm() {
    if (mergeSelected.length < 2) return
    setMergeConfirm(true)
  }

  function onMergeComplete(keepId: string, count: number) {
    setSelectedJobId(keepId)   // move selection to the kept entry
    exitMergeMode()
    setLoadTrigger(t => t + 1) // refresh jobs / modules / assignments / skills
    setMergeToast(`Merged ${count} ${count === 1 ? 'entry' : 'entries'}`)
    setTimeout(() => setMergeToast(''), 4000)
  }

  async function deleteJob(jobId: string) {
    setDeletingJob(true)
    await fetch(`/api/job-experiences/${jobId}`, { method: 'DELETE' })
    const nextJob = jobs.find(j => j.id !== jobId)
    setSelectedJobId(nextJob?.id ?? null)
    setJobs(prev => prev.filter(j => j.id !== jobId))
    setMja(prev => prev.filter(a => a.job_id !== jobId))
    setConfirmDeleteJobId(null)
    setDeletingJob(false)
  }

  async function syncJobsFromModules() {
    setSyncing(true)
    setSyncMessage('')
    const res = await fetch('/api/backfill-job-experiences', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setSyncMessage(`Synced ${data.jobs_created} job${data.jobs_created !== 1 ? 's' : ''}`)
      setLoadTrigger(t => t + 1)
      setTimeout(() => setSyncMessage(''), 3000)
    }
    setSyncing(false)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  const s: React.CSSProperties = {}
  void s

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">My Library</span>
          <span className="topbar-sub">
            — {modules.length} module{modules.length !== 1 ? 's' : ''} · {jobs.length} job{jobs.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="topbar-actions">
          {/* Re-parse resume — inline confirm, no modal */}
          {reparseState === 'idle' && (
            <button className="btn-ghost" onClick={() => setReparseState('confirm')}>↺ Re-parse resume</button>
          )}
          {reparseState === 'confirm' && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>Deletes and rebuilds all modules.</span>
              <button className="btn-primary" onClick={handleReparse} style={{ fontSize: 12, padding: '6px 12px' }}>Yes, re-parse</button>
              <button className="btn-ghost" onClick={() => setReparseState('idle')} style={{ fontSize: 12, padding: '6px 12px' }}>Cancel</button>
            </div>
          )}
          {reparseState === 'loading' && (
            <button className="btn-ghost" disabled>Re-parsing…</button>
          )}
          {reparseState === 'done' && (
            <span style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 500, whiteSpace: 'nowrap' }}>{reparseMsg}</span>
          )}
          {reparseState === 'error' && (
            <span style={{ fontSize: 13, color: 'var(--rose)', whiteSpace: 'nowrap' }}>{reparseMsg}</span>
          )}
          <Link href="/upload" className="btn-ghost" style={{ textDecoration: 'none' }}>Upload resume</Link>
          <Link href="/library/new" className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5.5 1v9M1 5.5h9"/></svg>
            New module
          </Link>
          <Link href="/generate" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            Generate resume
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="dash-content" style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

          {/* Merge confirmation modal (shared component) */}
          {mergeConfirm && (
            <MergeConfirmModal
              experiences={mergeSelected
                .map(id => jobs.find(x => x.id === id))
                .filter((j): j is Job => Boolean(j))
                .map(j => ({ id: j.id, company: displayCompany(j.company), title: j.title, start_date: j.start_date, end_date: j.end_date, location: j.location, moduleCount: jobModules(j.id).length }))}
              onCancel={() => setMergeConfirm(false)}
              onMerged={onMergeComplete}
            />
          )}

          {/* Merge result toast */}
          {mergeToast && (
            <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: 'var(--surface)', border: '1px solid var(--teal-glow)', color: 'var(--teal)', fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 999, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
              {mergeToast}
            </div>
          )}

          {/* ── LEFT: Jobs sidebar ── */}
          <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '12px 14px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 600 }}>Work Experience</span>
              {mergeMode ? (
                <span style={{ fontSize: 10, color: 'var(--teal)', fontWeight: 600 }}>Select to merge</span>
              ) : jobs.length >= 2 && (
                <button
                  onClick={() => { setMergeMode(true); setMergeSelected([]); setMergeConfirm(false) }}
                  className="btn-ghost"
                  style={{ fontSize: 10, padding: '2px 8px' }}
                >
                  Merge
                </button>
              )}
            </div>

            {jobs.length === 0 && !showAddJob && (
              <div style={{ padding: '24px 14px', textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No work experience yet</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>Add a job manually or upload a resume — we&apos;ll extract your work history automatically.</div>
              </div>
            )}

            {jobs.map(job => {
              const checked = mergeSelected.includes(job.id)
              const active = mergeMode ? checked : selectedJobId === job.id
              return (
              <button
                key={job.id}
                onClick={() => {
                  if (mergeMode) { toggleMergeSelect(job.id); return }
                  setSelectedJobId(job.id); setEditingJobId(null); setEditJobError(null); setConfirmDeleteJobId(null)
                }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', textAlign: 'left',
                  padding: '10px 14px', border: 'none',
                  borderLeft: `2px solid ${active ? 'var(--teal)' : 'transparent'}`,
                  background: active ? 'var(--teal-dim)' : 'transparent',
                  cursor: 'pointer', transition: 'all 0.1s',
                } as React.CSSProperties}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg3)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                {mergeMode && (
                  <span style={{
                    flexShrink: 0, marginTop: 1, width: 14, height: 14, borderRadius: 3,
                    border: `1.5px solid ${checked ? 'var(--teal)' : 'var(--border2)'}`,
                    background: checked ? 'var(--teal)' : 'transparent',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {checked && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5l2.5 2.5 4.5-5" /></svg>}
                  </span>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--teal)' : 'var(--text)', marginBottom: 2 }}>
                    {displayCompany(job.company)}
                  </div>
                  <div style={{ fontSize: 11, color: active ? 'var(--teal)' : 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {job.title && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{job.title}</span>}
                    {(job.start_date || job.end_date) && (
                      <span style={{ fontFamily: 'var(--mono)', opacity: 0.8 }}>
                        {[job.start_date, job.end_date].filter(Boolean).join('–')}
                      </span>
                    )}
                    <span style={{
                      fontSize: 10, padding: '1px 5px', borderRadius: 10,
                      background: active && jobModules(job.id).length > 0 ? 'var(--teal-dim)' : 'var(--surface)',
                      color: active && jobModules(job.id).length > 0 ? 'var(--teal)' : 'var(--text3)',
                      border: '1px solid var(--border2)',
                    }}>
                      {jobModules(job.id).length}
                    </span>
                  </div>
                </span>
              </button>
              )
            })}

            {/* Merge action bar (merge mode) */}
            {mergeMode && (
              <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg2)', position: 'sticky', bottom: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--text3)', flex: 1 }}>{mergeSelected.length} selected</span>
                <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }} onClick={exitMergeMode}>Cancel</button>
                <button
                  className="btn-primary"
                  style={{ fontSize: 11, padding: '5px 10px', opacity: mergeSelected.length < 2 ? 0.5 : 1, cursor: mergeSelected.length < 2 ? 'default' : 'pointer' }}
                  disabled={mergeSelected.length < 2}
                  onClick={openMergeConfirm}
                >
                  Merge →
                </button>
              </div>
            )}

            {/* Add job */}
            {!mergeMode && (showAddJob ? (
              <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
                <input
                  autoFocus
                  className="form-input"
                  style={{ marginBottom: 6, fontSize: 12, padding: '6px 10px' }}
                  placeholder="Company name"
                  value={newCompany}
                  onChange={e => setNewCompany(e.target.value)}
                />
                <input
                  className="form-input"
                  style={{ marginBottom: 6, fontSize: 12, padding: '6px 10px' }}
                  placeholder="Title (optional)"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                />
                <input
                  className="form-input"
                  style={{ marginBottom: 8, fontSize: 12, padding: '6px 10px' }}
                  placeholder="Dates e.g. 2021–2024"
                  value={newDates}
                  onChange={e => setNewDates(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addJob()}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={addJob} disabled={savingJob}>
                    {savingJob ? '…' : 'Save'}
                  </button>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => setShowAddJob(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={() => setShowAddJob(true)}
                  style={{ padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text3)', width: '100%', textAlign: 'left' }}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5.5 1v9M1 5.5h9"/></svg>
                  Add job
                </button>
                <button
                  onClick={syncJobsFromModules}
                  disabled={syncing}
                  style={{ padding: '8px 14px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: syncing ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: syncMessage ? 'var(--teal)' : 'var(--text3)', width: '100%', textAlign: 'left', opacity: syncing ? 0.6 : 1 }}
                >
                  {syncing ? (
                    <>
                      <svg className="spinner" width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="5.5" cy="5.5" r="4" strokeDasharray="8 18" opacity="0.4" /><path d="M5.5 1.5A4 4 0 019.5 5.5" /></svg>
                      Syncing…
                    </>
                  ) : syncMessage ? (
                    <>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="5.5" cy="5.5" r="4.5" /><path d="M3.5 5.5l1.5 1.5 2.5-2.5" /></svg>
                      {syncMessage}
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1.5 5.5A4 4 0 019.5 5.5M9.5 5.5l-1.5-1.5M9.5 5.5l-1.5 1.5" /></svg>
                      Sync jobs from modules
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* ── RIGHT: Main panel ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {selectedJob ? (
              <>
                {/* Job header */}
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
                  {editingJobId === selectedJob.id ? (
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                        <input autoFocus className="form-input" style={{ fontSize: 13, padding: '4px 8px', flex: '0 0 160px' }} placeholder="Company" value={editCompany} onChange={e => setEditCompany(e.target.value)} />
                        <input className="form-input" style={{ fontSize: 13, padding: '4px 8px', flex: 1 }} placeholder="Title" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        <input className="form-input" style={{ fontSize: 12, padding: '4px 8px', flex: 1 }} placeholder="Start date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} />
                        <input className="form-input" style={{ fontSize: 12, padding: '4px 8px', flex: 1 }} placeholder="End date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} />
                        <input className="form-input" style={{ fontSize: 12, padding: '4px 8px', flex: 1 }} placeholder="Location" value={editLocation} onChange={e => setEditLocation(e.target.value)} />
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-primary" style={{ fontSize: 11, padding: '4px 12px' }} onClick={saveEditJob} disabled={savingEditJob || !editCompany.trim()}>
                          {savingEditJob ? '…' : 'Save'}
                        </button>
                        <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => { setEditingJobId(null); setEditJobError(null) }}>Cancel</button>
                      </div>
                      {editJobError && (
                        <p style={{ fontSize: 11, color: 'var(--rose)', marginTop: 4 }}>
                          {editJobError}
                        </p>
                      )}
                    </div>
                  ) : confirmDeleteJobId === selectedJob.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>Delete this job and all its assignments?</span>
                      <button
                        className="btn-primary"
                        style={{ fontSize: 11, padding: '4px 12px', background: 'var(--rose)', borderColor: 'var(--rose)' }}
                        onClick={() => deleteJob(selectedJob.id)}
                        disabled={deletingJob}
                      >
                        {deletingJob ? '…' : 'Yes, delete'}
                      </button>
                      <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => setConfirmDeleteJobId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{displayCompany(selectedJob.company)}{selectedJob.title ? ` — ${selectedJob.title}` : ''}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                          {[selectedJob.start_date, selectedJob.end_date].filter(Boolean).join('–')}
                          {selectedJob.location && ` · ${selectedJob.location}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => startEditJob(selectedJob)}
                          title="Edit job"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}
                        >
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2l2 2-6 6H3V8l6-6z"/></svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteJobId(selectedJob.id)}
                          title="Delete job"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}
                        >
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3.5h9M4.5 3.5V2h4v1.5M5 6v4M8 6v4M3 3.5l.5 7h6l.5-7"/></svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Two-column: modules | skills */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, minHeight: 0, overflow: 'hidden', borderBottom: '1px solid var(--border)' }}>

                  {/* ── Modules column ── */}
                  <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 600 }}>
                        Modules at {displayCompany(selectedJob.company)}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{selectedModules.length} total</span>
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                      {selectedModules.length === 0 && (
                        <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>
                          No modules assigned yet.<br />
                          <span style={{ color: 'var(--teal)' }}>
                            {modules.filter(m => !mja.some(a => a.module_id === m.id && a.job_id === selectedJobId)).length} modules available in repository below ↓
                          </span>
                        </div>
                      )}
                      {selectedModules.map(m => {
                        const color = moduleColor(m)
                        const otherJobs = jobsForModule(m.id).filter(j => j.id !== selectedJobId)
                        return (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ width: 3, height: 32, borderRadius: 2, background: color, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{m.title}</div>
                              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--teal-dim)', color: 'var(--teal)', border: '1px solid var(--teal-glow)' }}>
                                  {displayCompany(selectedJob.company)}
                                </span>
                                {otherJobs.map(j => (
                                  <span key={j.id} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--surface)', color: 'var(--text3)', border: '1px solid var(--border2)' }}>
                                    {displayCompany(j.company)}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                              <Pips weight={m.weight} />
                              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <button
                                  onClick={() => openEditModal(m.id)}
                                  style={{ color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', display: 'flex', alignItems: 'center' }}
                                  title="Edit module"
                                >
                                  <svg width="11" height="11" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2l2 2-6 6H3V8l6-6z"/></svg>
                                </button>
                                <button
                                  onClick={() => unassignModuleFromJob(m.id, selectedJobId!)}
                                  style={{ fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', lineHeight: 1 }}
                                  title="Remove from this job"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* ── Skills column ── */}
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 600 }}>
                        Skills at {displayCompany(selectedJob.company)}
                      </span>
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1, padding: '14px 16px' }}>

                      {selectedSkills.length === 0 ? (
                        /* ── Empty state ── */
                        <div style={{ padding: '36px 16px', textAlign: 'center' }}>
                          <div style={{ color: 'var(--teal)', display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                            <SparkleIcon size={26} />
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No skills mapped yet</div>
                          <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, maxWidth: 260, margin: '0 auto 16px' }}>
                            Extract skills from your modules to build a complete picture of this role.
                          </div>
                          <button
                            onClick={extractSkills}
                            disabled={extracting}
                            className="btn-primary"
                            style={{ fontSize: 12, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 7, opacity: extracting ? 0.7 : 1, cursor: extracting ? 'default' : 'pointer' }}
                          >
                            {extracting ? (
                              <>
                                <svg className="spinner" width="12" height="12" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="5.5" cy="5.5" r="4" strokeDasharray="8 18" opacity="0.4" /><path d="M5.5 1.5A4 4 0 019.5 5.5" /></svg>
                                Extracting…
                              </>
                            ) : (
                              <>Extract skills ✦</>
                            )}
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Onboarding banner */}
                          {showOnboardBanner && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', marginBottom: 14, borderRadius: 8, background: 'rgba(29,158,117,0.10)', border: '1px solid var(--teal-glow)' }}>
                              <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 500, flex: 1, lineHeight: 1.4 }}>
                                ✦ We suggested skills from your resume — tap any to confirm them.
                              </span>
                              <button
                                onClick={dismissOnboardBanner}
                                title="Dismiss"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                              >×</button>
                            </div>
                          )}

                          {/* Lighter nudge when nothing has been confirmed yet */}
                          {!showOnboardBanner && allParsed && (
                            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.4 }}>
                              Review your AI-suggested skills and confirm the ones that fit.
                            </div>
                          )}

                          {/* Clustered groups */}
                          {skillGroups.map((group, gi) => {
                            const isLast = gi === skillGroups.length - 1
                            return (
                              <div key={String(group.key)} style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 600, marginBottom: 8 }}>
                                  {group.label}
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                  {group.items.map(skill =>
                                    skill.source === 'user' ? (
                                      editingSkillId === skill.id ? (
                                        /* Inline rename input — same pill shape/colors */
                                        <input
                                          key={skill.id}
                                          autoFocus
                                          value={editingSkillName}
                                          onChange={e => setEditingSkillName(e.target.value)}
                                          onFocus={e => e.target.select()}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                                            else if (e.key === 'Escape') { skillEditCancelRef.current = true; setEditingSkillId(null) }
                                          }}
                                          onBlur={() => saveSkillRename(skill.id)}
                                          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: 'rgba(29,158,117,0.10)', color: 'var(--teal)', border: '1px solid var(--teal-glow)', outline: 'none', fontFamily: 'var(--font)', width: `${Math.max(6, editingSkillName.length + 2)}ch` }}
                                        />
                                      ) : (
                                      /* Confirmed pill */
                                      <span
                                        key={skill.id}
                                        onClick={() => setArmedDeleteSkillId(armedDeleteSkillId === skill.id ? null : skill.id)}
                                        title="Click to remove"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '4px 10px', borderRadius: 20, background: 'rgba(29,158,117,0.10)', color: 'var(--teal)', border: '1px solid var(--teal-glow)', cursor: 'pointer' }}
                                      >
                                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M2.5 6.5l2.5 2.5 4.5-5" /></svg>
                                        {skill.name}
                                        <button
                                          onClick={e => { e.stopPropagation(); startEditSkill(skill) }}
                                          title="Rename skill"
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', padding: 0, display: 'inline-flex', alignItems: 'center', opacity: 0.7, flexShrink: 0 }}
                                        >
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                                        </button>
                                        {armedDeleteSkillId === skill.id && (
                                          <button
                                            onClick={e => { e.stopPropagation(); deleteSkill(skill.id) }}
                                            title="Delete skill"
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 1 }}
                                          >×</button>
                                        )}
                                      </span>
                                      )
                                    ) : (
                                      /* Suggested pill */
                                      <span
                                        key={skill.id}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '4px 8px 4px 10px', borderRadius: 20, background: 'var(--indigo-dim)', color: 'var(--indigo)', border: '1px solid var(--indigo)' }}
                                      >
                                        <span
                                          onClick={() => confirmSkill(skill)}
                                          title="Click to confirm"
                                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
                                        >
                                          <SparkleIcon size={10} />
                                          {skill.name}
                                        </span>
                                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', padding: '1px 4px', borderRadius: 4, background: 'var(--indigo)', color: '#fff', flexShrink: 0 }}>AI</span>
                                        <button
                                          onClick={() => deleteSkill(skill.id)}
                                          title="Dismiss"
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--indigo)', fontSize: 14, lineHeight: 1, padding: 0 }}
                                        >×</button>
                                      </span>
                                    )
                                  )}

                                  {/* + Add skill pill (after the last group) */}
                                  {isLast && (
                                    addingSkill ? (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <input
                                          autoFocus
                                          className="form-input"
                                          style={{ fontSize: 12, padding: '4px 10px', width: 140 }}
                                          placeholder="Skill name…"
                                          value={newSkillName}
                                          onChange={e => setNewSkillName(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') addSkill(newSkillName)
                                            if (e.key === 'Escape') { setAddingSkill(false); setNewSkillName('') }
                                          }}
                                        />
                                        <button
                                          className="btn-primary"
                                          style={{ fontSize: 11, padding: '5px 10px', whiteSpace: 'nowrap' }}
                                          onClick={() => addSkill(newSkillName)}
                                          disabled={savingSkill || !newSkillName.trim()}
                                        >
                                          {savingSkill ? '…' : 'Add'}
                                        </button>
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => setAddingSkill(true)}
                                        style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'none', color: 'var(--text3)', border: '1px dashed var(--border2)', cursor: 'pointer', fontFamily: 'var(--font)' }}
                                      >
                                        + Add skill
                                      </button>
                                    )
                                  )}
                                </div>
                              </div>
                            )
                          })}

                          {skillToast && (
                            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--teal)', fontWeight: 500 }}>
                              {skillToast}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
                {jobs.length === 0 ? 'Add a job on the left to get started.' : 'Select a job to see its modules and skills.'}
              </div>
            )}

            {/* ── Module Repository ── */}
            <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 600, flexShrink: 0 }}>
                  Module Repository
                </span>
                <input
                  style={{ fontSize: 12, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', outline: 'none', width: 180 }}
                  placeholder={`Search ${modules.length} modules…`}
                  value={repoSearch}
                  onChange={e => setRepoSearch(e.target.value)}
                />
                {(['all', 'anchor', 'strong', 'supporting', 'unassigned'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setRepoFilter(f)}
                    style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--font)',
                      background: repoFilter === f ? 'var(--teal-dim)' : 'none',
                      color: repoFilter === f ? 'var(--teal)' : 'var(--text3)',
                      border: `1px solid ${repoFilter === f ? 'var(--teal-glow)' : 'var(--border2)'}`,
                    }}
                  >
                    {f === 'all' ? `All (${modules.length})` : f === 'unassigned' ? `Unassigned (${modules.filter(m => !mja.some(a => a.module_id === m.id)).length})` : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, padding: '12px 16px', maxHeight: 240, overflowY: 'auto' }}>
                {repoModules.map(m => {
                  const color = moduleColor(m)
                  const jobsOn = jobsForModule(m.id)
                  const isOnSelected = selectedJobId ? mja.some(a => a.module_id === m.id && a.job_id === selectedJobId) : false
                  return (
                    <div
                      key={m.id}
                      style={{
                        background: 'var(--surface)', border: `1px solid ${isOnSelected ? 'var(--teal-glow)' : 'var(--border)'}`,
                        borderTop: `2px solid ${isOnSelected ? 'var(--teal)' : color}`,
                        borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                        {moduleDomain(m)}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: 6 }}>
                        {m.title}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                          {jobsOn.length > 0
                            ? jobsOn.map(j => displayCompany(j.company)).join(', ')
                            : <span style={{ fontStyle: 'italic', opacity: 0.7 }}>no job</span>
                          }
                        </div>
                        {selectedJobId && (
                          isOnSelected ? (
                            <button
                              onClick={() => unassignModuleFromJob(m.id, selectedJobId)}
                              style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--teal-dim)', color: 'var(--teal)', border: '1px solid var(--teal-glow)', cursor: 'pointer' }}
                            >
                              ✓ assigned
                            </button>
                          ) : (
                            <button
                              onClick={() => assignModuleToJob(m.id, selectedJobId)}
                              style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'none', color: 'var(--text3)', border: '1px solid var(--border2)', cursor: 'pointer' }}
                            >
                              + assign
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )
                })}
                {repoModules.length === 0 && modules.length === 0 && (
                  <div style={{ gridColumn: '1/-1', padding: '40px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No modules yet</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Upload a resume to automatically extract your experience into modules.</div>
                    <Link href="/upload" className="btn-primary" style={{ fontSize: 12, textDecoration: 'none', display: 'inline-block' }}>Upload a resume</Link>
                  </div>
                )}
                {repoModules.length === 0 && modules.length > 0 && (
                  <div style={{ gridColumn: '1/-1', padding: '20px', textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>
                    No modules match your search.
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Module Edit Modal ── */}
      {editingModuleId && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeEditModal() }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border2)',
            borderRadius: 16, width: '100%', maxWidth: 560,
            boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ padding: '18px 22px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>Edit Module</div>
              <button onClick={closeEditModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 20, lineHeight: 1, padding: '0 2px' }}>×</button>
            </div>

            {editModuleLoading ? (
              <div style={{ padding: '48px 22px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
            ) : (
              <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Title */}
                <div>
                  <label style={{ fontSize: 11, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text3)', display: 'block', marginBottom: 6 }}>Title</label>
                  <input
                    value={editModuleTitle}
                    onChange={e => setEditModuleTitle(e.target.value)}
                    style={{ width: '100%', fontSize: 13, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box' }}
                    placeholder="Module title"
                    autoFocus
                  />
                </div>

                {/* Content */}
                <div>
                  <label style={{ fontSize: 11, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text3)', display: 'block', marginBottom: 6 }}>Content</label>
                  <textarea
                    value={editModuleContent}
                    onChange={e => setEditModuleContent(e.target.value)}
                    rows={6}
                    style={{ width: '100%', fontSize: 13, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'var(--font)', outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }}
                    placeholder="Describe what this module covers…"
                  />
                </div>

                {/* Weight + Themes row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text3)', display: 'block', marginBottom: 6 }}>Weight</label>
                    <select
                      value={editModuleWeight}
                      onChange={e => setEditModuleWeight(e.target.value)}
                      style={{ width: '100%', fontSize: 13, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'var(--font)', outline: 'none', cursor: 'pointer' }}
                    >
                      <option value="anchor">Anchor (5 pips)</option>
                      <option value="strong">Strong (3 pips)</option>
                      <option value="supporting">Supporting (2 pips)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text3)', display: 'block', marginBottom: 6 }}>Themes <span style={{ opacity: 0.5, textTransform: 'none', fontFamily: 'var(--font)', letterSpacing: 0 }}>(comma-separated)</span></label>
                    <input
                      value={editModuleThemes}
                      onChange={e => setEditModuleThemes(e.target.value)}
                      style={{ width: '100%', fontSize: 13, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box' }}
                      placeholder="leadership, data, community…"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                  <button onClick={closeEditModal} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border2)', background: 'none', color: 'var(--text3)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    Cancel
                  </button>
                  <button
                    onClick={saveModuleEdit}
                    disabled={savingModule || !editModuleTitle.trim()}
                    style={{ fontSize: 13, padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', cursor: savingModule ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', fontWeight: 600, opacity: (!editModuleTitle.trim() || savingModule) ? 0.6 : 1 }}
                  >
                    {savingModule ? 'Saving…' : 'Save changes'}
                  </button>
                </div>

              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
