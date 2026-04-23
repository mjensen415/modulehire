'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Module = {
  id: string
  type: string
  title: string
  content: string
  source_company: string | null
  source_role_title: string | null
  date_start: string | null
  date_end: string | null
  weight: string
  role_types: string[]
  themes: string[]
  company_stage: string[]
}

type ReviewModule = Module & {
  _discarded: boolean
  _isNew: boolean
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function weightColor(w: string) {
  if (w === 'anchor') return 'c-teal'
  if (w === 'strong') return 'c-indigo'
  return 'c-amber'
}

function groupByCompany(modules: ReviewModule[]): Record<string, ReviewModule[]> {
  const groups: Record<string, ReviewModule[]> = {}
  for (const m of modules) {
    const key = m.source_company || '(No company)'
    if (!groups[key]) groups[key] = []
    groups[key].push(m)
  }
  return groups
}

function countBy<T>(arr: T[], key: keyof T) {
  const counts: Record<string, number> = {}
  for (const item of arr) {
    const val = String(item[key] ?? 'unknown')
    counts[val] = (counts[val] ?? 0) + 1
  }
  return counts
}

// ─── ICONS ────────────────────────────────────────────────────────────────────

function IconEdit() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M7 1.5L9.5 4L3.5 10H1v-2.5L7 1.5z" /></svg>
}
function IconTrash() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 3h7M4.5 3V2h2v1M4 3v6M7 3v6M2.5 3l.5 6h5l.5-6" /></svg>
}
function IconUndo() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5.5a4 4 0 107 3.5" /><path d="M2 3v2.5h2.5" /></svg>
}
function IconPlus() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5.5 1v9M1 5.5h9" /></svg>
}

// ─── INLINE EDIT FORM ─────────────────────────────────────────────────────────

type EditFormProps = {
  initial: ReviewModule
  onSave: (updated: Partial<ReviewModule>) => void
  onCancel: () => void
}

function EditForm({ initial, onSave, onCancel }: EditFormProps) {
  const [fields, setFields] = useState({
    title: initial.title,
    content: initial.content,
    weight: initial.weight,
    source_company: initial.source_company ?? '',
    source_role_title: initial.source_role_title ?? '',
    date_start: initial.date_start ?? '',
    date_end: initial.date_end ?? '',
  })

  function set(key: string, val: string) {
    setFields(f => ({ ...f, [key]: val }))
  }

  return (
    <div className="mod-edit-form">
      <div className="mod-edit-row">
        <label>Title</label>
        <input className="mod-edit-input" value={fields.title} onChange={e => set('title', e.target.value)} />
      </div>
      <div className="mod-edit-row">
        <label>Content</label>
        <textarea className="mod-edit-textarea" rows={4} value={fields.content} onChange={e => set('content', e.target.value)} />
      </div>
      <div className="mod-edit-cols">
        <div className="mod-edit-row">
          <label>Weight</label>
          <select className="mod-edit-select" value={fields.weight} onChange={e => set('weight', e.target.value)}>
            <option value="anchor">anchor</option>
            <option value="strong">strong</option>
            <option value="supporting">supporting</option>
          </select>
        </div>
        <div className="mod-edit-row">
          <label>Company</label>
          <input className="mod-edit-input" value={fields.source_company} onChange={e => set('source_company', e.target.value)} />
        </div>
      </div>
      <div className="mod-edit-cols">
        <div className="mod-edit-row">
          <label>Role title</label>
          <input className="mod-edit-input" value={fields.source_role_title} onChange={e => set('source_role_title', e.target.value)} />
        </div>
        <div className="mod-edit-row">
          <label>Date start</label>
          <input className="mod-edit-input" placeholder="YYYY-MM" value={fields.date_start} onChange={e => set('date_start', e.target.value)} />
        </div>
        <div className="mod-edit-row">
          <label>Date end</label>
          <input className="mod-edit-input" placeholder="YYYY-MM or present" value={fields.date_end} onChange={e => set('date_end', e.target.value)} />
        </div>
      </div>
      <div className="mod-edit-actions">
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 14px' }} onClick={() => onSave(fields)}>Save</button>
        <button className="btn-ghost" style={{ fontSize: 12, padding: '5px 14px' }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ─── MODULE CARD ──────────────────────────────────────────────────────────────

function ModCard({
  mod,
  onEdit,
  onDiscard,
  onUndo,
}: {
  mod: ReviewModule
  onEdit: (updates: Partial<ReviewModule>) => void
  onDiscard: () => void
  onUndo: () => void
}) {
  const [editing, setEditing] = useState(mod._isNew)
  const color = weightColor(mod.weight)

  if (editing) {
    return (
      <div className={`mod-card ${color}`} style={mod._discarded ? { opacity: 0.4 } : undefined}>
        <EditForm
          initial={mod}
          onSave={updates => { onEdit(updates); setEditing(false) }}
          onCancel={() => { if (mod._isNew && !mod.title) onDiscard(); else setEditing(false) }}
        />
      </div>
    )
  }

  return (
    <div
      className={`mod-card ${color}`}
      style={mod._discarded ? { opacity: 0.4, textDecoration: 'line-through' } : undefined}
    >
      <div className="mod-domain">{mod.title}</div>
      <div className="mod-content">{mod.content.slice(0, 120)}{mod.content.length > 120 ? '…' : ''}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <span className={`plan-chip plan-${mod.weight}`} style={{ fontSize: 9 }}>{mod.weight}</span>
        {mod.source_role_title && (
          <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{mod.source_role_title}</span>
        )}
      </div>
      <div className="mod-actions">
        {!mod._discarded && (
          <button className="mod-action-btn" title="Edit" onClick={() => setEditing(true)}>
            <IconEdit />
          </button>
        )}
        {mod._discarded ? (
          <button className="mod-action-btn" title="Undo discard" onClick={onUndo} style={{ color: 'var(--teal)' }}>
            <IconUndo />
          </button>
        ) : (
          <button className="mod-action-btn del" title="Discard" onClick={onDiscard}>
            <IconTrash />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function ModuleReview() {
  const router = useRouter()
  const [modules, setModules] = useState<ReviewModule[]>([])
  const [resumeId, setResumeId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const nextTempId = useRef(0)

  useEffect(() => {
    const raw = sessionStorage.getItem('pendingModules')
    if (!raw) { router.replace('/upload'); return }
    sessionStorage.removeItem('pendingModules')
    const { resume_id, modules: mods } = JSON.parse(raw) as { resume_id: string; modules: Module[] }
    setResumeId(resume_id)
    setModules(mods.map(m => ({ ...m, _discarded: false, _isNew: false })))
    setLoaded(true)
  }, [router])

  if (!loaded) {
    return (
      <div style={{ padding: 40, color: 'var(--text3)', fontSize: 14 }}>Loading modules…</div>
    )
  }

  const active = modules.filter(m => !m._discarded)
  const groups = groupByCompany(modules)
  const typeCounts = countBy(active, 'type')
  const weightCounts = countBy(active, 'weight')
  const companies = [...new Set(active.map(m => m.source_company).filter(Boolean))]

  function updateModule(id: string, updates: Partial<ReviewModule>) {
    setModules(ms => ms.map(m => m.id === id ? { ...m, ...updates } : m))
  }
  function discardModule(id: string) {
    setModules(ms => ms.map(m => m.id === id ? { ...m, _discarded: true } : m))
  }
  function undoDiscard(id: string) {
    setModules(ms => ms.map(m => m.id === id ? { ...m, _discarded: false } : m))
  }
  function addModule(company: string) {
    const tempId = `new-${nextTempId.current++}`
    const newMod: ReviewModule = {
      id: tempId,
      type: 'experience',
      title: '',
      content: '',
      source_company: company || null,
      source_role_title: null,
      date_start: null,
      date_end: null,
      weight: 'strong',
      role_types: [],
      themes: [],
      company_stage: ['any'],
      _discarded: false,
      _isNew: true,
    }
    setModules(ms => [...ms, newMod])
  }

  async function acceptAll() {
    const toSave = modules
      .filter(m => !m._discarded)
      .map(({ _discarded, _isNew, ...m }) => {
        // Strip temp IDs for new modules — the API will assign real ones
        if (m.id.startsWith('new-')) return { ...m, id: undefined }
        return m
      })

    setSaving(true)
    try {
      const res = await fetch('/api/modules/bulk-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_id: resumeId, modules: toSave }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Save failed')
      }
      router.push('/library')
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', margin: '-36px -40px', minHeight: '100vh' }}>

      {/* TOP BAR */}
      <div className="top-bar">
        <div className="top-bar-left">
          <div className="top-bar-title">Review extracted modules</div>
          <div className="top-bar-sub">{active.length} module{active.length !== 1 ? 's' : ''} · {companies.length} company{companies.length !== 1 ? 'ies' : ''}</div>
        </div>
        <div className="top-bar-right">
          <button className="btn-primary" onClick={acceptAll} disabled={saving}>
            {saving ? 'Saving…' : `Accept all & save →`}
          </button>
        </div>
      </div>

      <div className="review-panels">

        {/* LEFT: MODULE LIST */}
        <div className="modules-panel">

          {/* Global add button */}
          <div style={{ marginBottom: 24 }}>
            <button
              className="btn-ghost"
              style={{ fontSize: 12 }}
              onClick={() => addModule('')}
            >
              <IconPlus /> Add blank module
            </button>
          </div>

          {Object.entries(groups).map(([company, mods]) => (
            <div key={company} className="source-job">
              <div className="source-job-header">
                <span className="source-company">{company}</span>
                {mods[0]?.source_role_title && (
                  <span className="source-role">{mods[0].source_role_title}</span>
                )}
                {(mods[0]?.date_start || mods[0]?.date_end) && (
                  <span className="source-dates">{mods[0].date_start ?? ''}{mods[0].date_end ? ` – ${mods[0].date_end}` : ''}</span>
                )}
              </div>

              <div className="module-cards">
                {mods.map(m => (
                  <ModCard
                    key={m.id}
                    mod={m}
                    onEdit={updates => updateModule(m.id, updates)}
                    onDiscard={() => discardModule(m.id)}
                    onUndo={() => undoDiscard(m.id)}
                  />
                ))}
              </div>

              <button
                className="btn-ghost"
                style={{ fontSize: 11, marginTop: 10 }}
                onClick={() => addModule(company)}
              >
                <IconPlus /> Add module for {company}
              </button>
            </div>
          ))}
        </div>

        {/* RIGHT: SUMMARY STATS */}
        <div className="source-panel">
          <div className="source-title">Summary</div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>By type</div>
            {(['experience', 'skill', 'story', 'positioning'] as const).map(t => (
              <div key={t} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: 'var(--text2)' }}>{t}</span>
                <span style={{ color: 'var(--text)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{typeCounts[t] ?? 0}</span>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>By weight</div>
            {(['anchor', 'strong', 'supporting'] as const).map(w => (
              <div key={w} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: 'var(--text2)' }}>{w}</span>
                <span style={{ color: 'var(--text)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{weightCounts[w] ?? 0}</span>
              </div>
            ))}
          </div>

          {companies.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Companies</div>
              {companies.map(c => (
                <div key={String(c)} style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--mono)', marginBottom: 4 }}>{String(c)}</div>
              ))}
            </div>
          )}

          <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
            {active.length >= 15
              ? `Strong library — ${active.length} modules across ${companies.length} companies.`
              : active.length >= 8
              ? `Good start — ${active.length} modules. Consider adding positioning or skill modules.`
              : `${active.length} modules so far. Most resumes produce 10–20.`}
          </div>
        </div>

      </div>
    </div>
  )
}
