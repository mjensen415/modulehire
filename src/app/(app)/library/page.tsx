'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────
type Job = { id: string; company: string; title: string | null; start_date: string | null; end_date: string | null; location: string | null; employment_type: string | null }
type Module = { id: string; title: string; weight: string | null; themes: string[] | null; type: string | null; source_company: string | null }
type MJA = { module_id: string; job_id: string }
type Skill = { id: string; job_id: string; name: string }
type SMA = { skill_id: string; module_id: string }

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
  if (r === 'positioning') return 'Positioning'
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LibraryPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [mja, setMja] = useState<MJA[]>([])       // module-job assignments
  const [skills, setSkills] = useState<Skill[]>([])
  const [sma, setSma] = useState<SMA[]>([])         // skill-module assignments
  const [loading, setLoading] = useState(true)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  // Sync state
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [loadTrigger, setLoadTrigger] = useState(0)

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

  // Module picker for skills (which skill is open)
  const [pickingModuleForSkill, setPickingModuleForSkill] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Repository
  const [repoSearch, setRepoSearch] = useState('')
  const [repoFilter, setRepoFilter] = useState<'all' | 'anchor' | 'strong' | 'supporting' | 'unassigned'>('all')

  // ─── Load all data ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true)
      const [jobsRes, modulesRes, mjaRes, skillsRes, smaRes] = await Promise.all([
        fetch('/api/job-experiences').then(r => r.json()),
        fetch('/api/my-modules').then(r => r.json()),
        fetch('/api/module-job-assignments').then(r => r.json()),
        fetch('/api/job-skills').then(r => r.json()),
        fetch('/api/skill-module-assignments').then(r => r.json()),
      ])
      setJobs(jobsRes.jobs ?? [])
      setModules(modulesRes.modules ?? [])
      setMja(mjaRes.assignments ?? [])
      setSkills(skillsRes.skills ?? [])
      setSma(smaRes.assignments ?? [])
      if (jobsRes.jobs?.length > 0) setSelectedJobId(jobsRes.jobs[0].id)
      setLoading(false)
    }
    load()
  }, [loadTrigger])

  // Close picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickingModuleForSkill(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
  const jobModules = (jobId: string) => modules.filter(m => mja.some(a => a.module_id === m.id && a.job_id === jobId))
  const jobsForModule = (moduleId: string) => jobs.filter(j => mja.some(a => a.module_id === moduleId && a.job_id === j.id))
  const skillsForJob = (jobId: string) => skills.filter(s => s.job_id === jobId)
  const modulesForSkill = (skillId: string) => modules.filter(m => sma.some(a => a.skill_id === skillId && a.module_id === m.id))

  const selectedModules = selectedJobId ? jobModules(selectedJobId) : []
  const selectedSkills = selectedJobId ? skillsForJob(selectedJobId) : []

  // Suggested skills from module themes not yet added as skills for this job
  const existingSkillNames = new Set(selectedSkills.map(s => s.name.toLowerCase()))
  const suggestedSkills = Array.from(
    new Set(selectedModules.flatMap(m => m.themes ?? []))
  ).filter(t => !existingSkillNames.has(t.toLowerCase())).slice(0, 5)

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
    // Also remove skill-module assignments for skills at this job
    const jobSkillIds = new Set(skills.filter(s => s.job_id === jobId).map(s => s.id))
    setSma(prev => prev.filter(a => !(jobSkillIds.has(a.skill_id) && a.module_id === moduleId)))
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
    }
    setSavingSkill(false)
  }

  async function deleteSkill(skillId: string) {
    setSkills(prev => prev.filter(s => s.id !== skillId))
    setSma(prev => prev.filter(a => a.skill_id !== skillId))
    await fetch(`/api/job-skills/${skillId}`, { method: 'DELETE' })
  }

  async function assignModuleToSkill(skillId: string, moduleId: string) {
    setSma(prev => [...prev, { skill_id: skillId, module_id: moduleId }])
    setPickingModuleForSkill(null)
    await fetch('/api/skill-module-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill_id: skillId, module_id: moduleId }),
    })
  }

  async function unassignModuleFromSkill(skillId: string, moduleId: string) {
    setSma(prev => prev.filter(a => !(a.skill_id === skillId && a.module_id === moduleId)))
    await fetch('/api/skill-module-assignments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill_id: skillId, module_id: moduleId }),
    })
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
    if (data.job) {
      setJobs(prev => prev.map(j => j.id === editingJobId ? data.job : j))
      setEditingJobId(null)
    }
    setSavingEditJob(false)
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

          {/* ── LEFT: Jobs sidebar ── */}
          <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '12px 14px 6px', fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 600 }}>
              Work Experience
            </div>

            {jobs.length === 0 && !showAddJob && (
              <div style={{ padding: '24px 14px', textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No work experience yet</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>Add a job manually or upload a resume — we&apos;ll extract your work history automatically.</div>
              </div>
            )}

            {jobs.map(job => (
              <button
                key={job.id}
                onClick={() => { setSelectedJobId(job.id); setEditingJobId(null); setConfirmDeleteJobId(null) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 14px', border: 'none',
                  borderLeft: `2px solid ${selectedJobId === job.id ? 'var(--teal)' : 'transparent'}`,
                  background: selectedJobId === job.id ? 'var(--teal-dim)' : 'transparent',
                  cursor: 'pointer', transition: 'all 0.1s',
                } as React.CSSProperties}
                onMouseEnter={e => { if (selectedJobId !== job.id) e.currentTarget.style.background = 'var(--bg3)' }}
                onMouseLeave={e => { if (selectedJobId !== job.id) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: selectedJobId === job.id ? 'var(--teal)' : 'var(--text)', marginBottom: 2 }}>
                  {job.company}
                </div>
                <div style={{ fontSize: 11, color: selectedJobId === job.id ? 'var(--teal)' : 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {job.title && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{job.title}</span>}
                  {(job.start_date || job.end_date) && (
                    <span style={{ fontFamily: 'var(--mono)', opacity: 0.8 }}>
                      {[job.start_date, job.end_date].filter(Boolean).join('–')}
                    </span>
                  )}
                  <span style={{
                    fontSize: 10, padding: '1px 5px', borderRadius: 10,
                    background: selectedJobId === job.id && jobModules(job.id).length > 0 ? 'var(--teal-dim)' : 'var(--surface)',
                    color: selectedJobId === job.id && jobModules(job.id).length > 0 ? 'var(--teal)' : 'var(--text3)',
                    border: '1px solid var(--border2)',
                  }}>
                    {jobModules(job.id).length}
                  </span>
                </div>
              </button>
            ))}

            {/* Add job */}
            {showAddJob ? (
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
            )}
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
                        <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => setEditingJobId(null)}>Cancel</button>
                      </div>
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
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{selectedJob.company}{selectedJob.title ? ` — ${selectedJob.title}` : ''}</div>
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
                        Modules at {selectedJob.company}
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
                                  {selectedJob.company}
                                </span>
                                {otherJobs.map(j => (
                                  <span key={j.id} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--surface)', color: 'var(--text3)', border: '1px solid var(--border2)' }}>
                                    {j.company}
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
                        Skills at {selectedJob.company}
                      </span>
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>

                      {selectedSkills.map(skill => {
                        const assignedModules = modulesForSkill(skill.id)
                        const unassignedJobModules = selectedModules.filter(m => !sma.some(a => a.skill_id === skill.id && a.module_id === m.id))
                        return (
                          <div key={skill.id} style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0 }} />
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{skill.name}</div>
                              <button
                                onClick={() => deleteSkill(skill.id)}
                                style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer' }}
                                title="Delete skill"
                              >×</button>
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                              {assignedModules.map(m => (
                                <span
                                  key={m.id}
                                  onClick={() => unassignModuleFromSkill(skill.id, m.id)}
                                  title="Click to remove"
                                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--surface)', color: 'var(--text2)', border: '1px solid var(--border2)', cursor: 'pointer', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                >
                                  {m.title} ×
                                </span>
                              ))}
                              {/* Picker trigger */}
                              {unassignedJobModules.length > 0 && (
                                <div style={{ position: 'relative' }} ref={pickingModuleForSkill === skill.id ? pickerRef : undefined}>
                                  <button
                                    onClick={() => setPickingModuleForSkill(pickingModuleForSkill === skill.id ? null : skill.id)}
                                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'none', color: 'var(--teal)', border: '1px dashed var(--teal-glow)', cursor: 'pointer' }}
                                  >
                                    + assign module
                                  </button>
                                  {pickingModuleForSkill === skill.id && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, minWidth: 200, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                                      {unassignedJobModules.map(m => (
                                        <button
                                          key={m.id}
                                          onClick={() => assignModuleToSkill(skill.id, m.id)}
                                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font)' }}
                                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                        >
                                          {m.title}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {selectedSkills.length === 0 && suggestedSkills.length === 0 && (
                        <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>
                          No skills yet. Add one below or they&apos;ll be suggested from your module themes.
                        </div>
                      )}

                      {/* Suggestions */}
                      {suggestedSkills.length > 0 && (
                        <div style={{ padding: '8px 16px' }}>
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Suggested from your modules</div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {suggestedSkills.map(t => (
                              <button
                                key={t}
                                onClick={() => addSkill(t)}
                                style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'none', color: 'var(--text3)', border: '1px dashed var(--border2)', cursor: 'pointer', fontFamily: 'var(--font)' }}
                              >
                                + {t}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Add skill input */}
                      <div style={{ padding: '8px 16px', display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          className="form-input"
                          style={{ flex: 1, fontSize: 12, padding: '6px 10px' }}
                          placeholder="Add a skill…"
                          value={newSkillName}
                          onChange={e => setNewSkillName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addSkill(newSkillName)}
                        />
                        <button
                          className="btn-primary"
                          style={{ fontSize: 11, padding: '6px 12px', whiteSpace: 'nowrap' }}
                          onClick={() => addSkill(newSkillName)}
                          disabled={savingSkill || !newSkillName.trim()}
                        >
                          {savingSkill ? '…' : 'Add'}
                        </button>
                      </div>
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
                            ? jobsOn.map(j => j.company).join(', ')
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
