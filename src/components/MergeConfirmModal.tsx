'use client'

import { useState } from 'react'

export type MergeExperience = {
  id: string
  company: string
  title: string | null
  start_date: string | null
  end_date: string | null
  location: string | null
  moduleCount: number
}

type SkillConflict = {
  name: string
  new_source: string
  existing_source: string
  new_category: string | null
  existing_category: string | null
}

// Shared merge confirmation flow: pick the primary entry, optionally clean up
// its company/title, resolve any skill category conflicts (surfaced via a
// dry-run to /api/merge-experiences), then merge. Used by the library merge
// action and the post-parse duplicate-resolution step.
export default function MergeConfirmModal({
  experiences,
  defaultPrimaryId,
  onCancel,
  onMerged,
}: {
  experiences: MergeExperience[]
  defaultPrimaryId?: string
  onCancel: () => void
  onMerged: (keepId: string, mergedCount: number) => void
}) {
  const initialPrimary = defaultPrimaryId && experiences.some(e => e.id === defaultPrimaryId)
    ? defaultPrimaryId
    : experiences[0]?.id ?? ''
  const primaryOf = (id: string) => experiences.find(e => e.id === id)

  const [primaryId, setPrimaryId] = useState(initialPrimary)
  const [company, setCompany] = useState(primaryOf(initialPrimary)?.company ?? '')
  const [title, setTitle] = useState(primaryOf(initialPrimary)?.title ?? '')
  const [phase, setPhase] = useState<'pick' | 'skills'>('pick')
  const [conflicts, setConflicts] = useState<SkillConflict[]>([])
  const [resolutions, setResolutions] = useState<Record<string, 'keep_existing' | 'use_new'>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pickPrimary(id: string) {
    setPrimaryId(id)
    setCompany(primaryOf(id)?.company ?? '')
    setTitle(primaryOf(id)?.title ?? '')
  }

  async function runMerge(skillResolutions: Record<string, 'keep_existing' | 'use_new'>) {
    const keep = primaryOf(primaryId)
    if (!keep) return
    const mergeIds = experiences.filter(e => e.id !== primaryId).map(e => e.id)
    const res = await fetch('/api/merge-experiences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keep_id: primaryId, merge_ids: mergeIds, skill_resolutions: skillResolutions }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Merge failed')

    // Optional rename of the kept entry (PATCH overwrites all fields, so carry
    // the kept entry's existing dates/location through).
    const newCompany = company.trim() || keep.company
    const newTitle = title.trim() || null
    if (newCompany !== keep.company || newTitle !== keep.title) {
      await fetch(`/api/job-experiences/${primaryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: newCompany, title: newTitle,
          start_date: keep.start_date, end_date: keep.end_date, location: keep.location,
        }),
      }).catch(() => {})
    }
    onMerged(primaryId, data.merged_count ?? mergeIds.length)
  }

  async function onContinue() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const mergeIds = experiences.filter(e => e.id !== primaryId).map(e => e.id)
      // Dry run to surface skill conflicts.
      const res = await fetch('/api/merge-experiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_id: primaryId, merge_ids: mergeIds, dry_run: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not check for conflicts')
      const found: SkillConflict[] = data.skill_conflicts ?? []
      if (found.length > 0) {
        setConflicts(found)
        setResolutions(Object.fromEntries(found.map(c => [c.name, 'keep_existing' as const])))
        setPhase('skills')
      } else {
        await runMerge({})
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function onConfirmWithSkills() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await runMerge(resolutions)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const dates = (e: MergeExperience) => [e.start_date, e.end_date].filter(Boolean).join(' – ')

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={() => { if (!busy) onCancel() }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 440, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
        {phase === 'pick' ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Which entry should be the primary?</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.5 }}>Modules and skills from the others move into this one; the rest are removed.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {experiences.map(e => {
                const isPrimary = primaryId === e.id
                return (
                  <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${isPrimary ? 'var(--teal-glow)' : 'var(--border2)'}`, background: isPrimary ? 'var(--teal-dim)' : 'transparent' }}>
                    <input type="radio" name="mergePrimary" checked={isPrimary} onChange={() => pickPrimary(e.id)} style={{ accentColor: 'var(--teal)', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: isPrimary ? 'var(--teal)' : 'var(--text)' }}>{e.company}</span>
                      {e.title && <span style={{ fontSize: 12, color: 'var(--text3)' }}> — {e.title}</span>}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{e.moduleCount} module{e.moduleCount === 1 ? '' : 's'}</span>
                  </label>
                )
              })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>Company</div>
                <input className="form-input" style={{ fontSize: 13, padding: '7px 10px' }} value={company} onChange={e => setCompany(e.target.value)} placeholder="Company name" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>Title</div>
                <input className="form-input" style={{ fontSize: 13, padding: '7px 10px' }} value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)" />
              </div>
            </div>
            {error && <div style={{ fontSize: 12, color: 'var(--rose)', marginBottom: 12 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={onCancel} disabled={busy}>Cancel</button>
              <button className="btn-primary" style={{ fontSize: 12 }} onClick={onContinue} disabled={busy || !primaryId}>{busy ? 'Working…' : 'Continue'}</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Resolve {conflicts.length} skill conflict{conflicts.length === 1 ? '' : 's'}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.5 }}>These skills appear on both entries with a different category. Pick which to keep.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
              {conflicts.map(c => (
                <div key={c.name}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{c.name}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
                      <input type="radio" name={`res-${c.name}`} checked={resolutions[c.name] !== 'use_new'} onChange={() => setResolutions(r => ({ ...r, [c.name]: 'keep_existing' }))} style={{ accentColor: 'var(--teal)' }} />
                      Keep existing <span style={{ color: 'var(--text3)' }}>({c.existing_category ?? 'none'})</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
                      <input type="radio" name={`res-${c.name}`} checked={resolutions[c.name] === 'use_new'} onChange={() => setResolutions(r => ({ ...r, [c.name]: 'use_new' }))} style={{ accentColor: 'var(--teal)' }} />
                      Use new <span style={{ color: 'var(--text3)' }}>({c.new_category ?? 'none'})</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
            {error && <div style={{ fontSize: 12, color: 'var(--rose)', marginBottom: 12 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setPhase('pick')} disabled={busy}>Back</button>
              <button className="btn-primary" style={{ fontSize: 12 }} onClick={onConfirmWithSkills} disabled={busy}>{busy ? 'Merging…' : 'Confirm merge'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
