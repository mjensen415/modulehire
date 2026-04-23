'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Module = {
  id: string
  title: string
  content: string
  weight: string
  type: string
  source_company: string | null
  source_role_title: string | null
  date_start: string | null
  date_end: string | null
  employment_type: string | null
}

export default function EditModuleForm({ module: initial }: { module: Module }) {
  const router = useRouter()
  const [fields, setFields] = useState({
    title: initial.title ?? '',
    content: initial.content ?? '',
    weight: initial.weight ?? 'supporting',
    type: initial.type ?? 'experience',
    source_company: initial.source_company ?? '',
    source_role_title: initial.source_role_title ?? '',
    date_start: initial.date_start ?? '',
    date_end: initial.date_end ?? '',
    employment_type: initial.employment_type ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  function set(key: string, val: string) {
    setFields(f => ({ ...f, [key]: val }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/modules/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...fields,
          source_company: fields.source_company || null,
          source_role_title: fields.source_role_title || null,
          date_start: fields.date_start || null,
          date_end: fields.date_end || null,
          employment_type: fields.employment_type || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      router.push('/library')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this module? This cannot be undone.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/modules/${initial.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Delete failed')
      }
      router.push('/library')
    } catch (e) {
      setError((e as Error).message)
      setDeleting(false)
    }
  }

  return (
    <div style={{ paddingTop: 8 }}>
      {error && (
        <div style={{ background: 'oklch(0.4 0.18 10 / 0.15)', border: '1px solid var(--rose)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--rose)', marginBottom: 20 }}>
          {error}
        </div>
      )}

      <div className="mod-edit-form">
        <div className="mod-edit-row">
          <label>Title</label>
          <input className="mod-edit-input" value={fields.title} onChange={e => set('title', e.target.value)} />
        </div>

        <div className="mod-edit-row">
          <label>Content</label>
          <textarea className="mod-edit-textarea" rows={6} value={fields.content} onChange={e => set('content', e.target.value)} />
        </div>

        <div className="mod-edit-cols">
          <div className="mod-edit-row">
            <label>Weight</label>
            <select className="mod-edit-select" value={fields.weight} onChange={e => set('weight', e.target.value)}>
              <option value="anchor">Anchor</option>
              <option value="strong">Strong</option>
              <option value="supporting">Supporting</option>
            </select>
          </div>
          <div className="mod-edit-row">
            <label>Type</label>
            <select className="mod-edit-select" value={fields.type} onChange={e => set('type', e.target.value)}>
              <option value="experience">Experience</option>
              <option value="skill">Skill</option>
              <option value="story">Story</option>
              <option value="positioning">Positioning</option>
            </select>
          </div>
        </div>

        <div className="mod-edit-cols">
          <div className="mod-edit-row">
            <label>Company</label>
            <input className="mod-edit-input" value={fields.source_company} onChange={e => set('source_company', e.target.value)} />
          </div>
          <div className="mod-edit-row">
            <label>Role title</label>
            <input className="mod-edit-input" value={fields.source_role_title} onChange={e => set('source_role_title', e.target.value)} />
          </div>
        </div>

        <div className="mod-edit-cols">
          <div className="mod-edit-row">
            <label>Date start</label>
            <input className="mod-edit-input" placeholder="YYYY-MM" value={fields.date_start} onChange={e => set('date_start', e.target.value)} />
          </div>
          <div className="mod-edit-row">
            <label>Date end</label>
            <input className="mod-edit-input" placeholder="YYYY-MM or present" value={fields.date_end} onChange={e => set('date_end', e.target.value)} />
          </div>
          <div className="mod-edit-row">
            <label>Employment type</label>
            <input className="mod-edit-input" placeholder="e.g. full-time" value={fields.employment_type} onChange={e => set('employment_type', e.target.value)} />
          </div>
        </div>

        <div className="mod-edit-actions" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ fontSize: 13 }} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => router.push('/library')}>
              Cancel
            </button>
          </div>
          <button
            className="btn-ghost"
            style={{ fontSize: 12, color: 'var(--rose)' }}
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete module'}
          </button>
        </div>
      </div>
    </div>
  )
}
