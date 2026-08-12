'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ROLE_TEMPLATES, getRoleTemplate } from '@/data/role-templates'

const DEFAULT_CONTENT_PLACEHOLDER =
  'Describe what you did, the impact, and any metrics. This content will be used directly in your resume.'

export default function NewModuleForm() {
  const router = useRouter()
  const [fields, setFields] = useState({
    title: '',
    content: '',
    weight: 'supporting',
    type: 'experience',
    source_company: '',
    source_role_title: '',
    date_start: '',
    date_end: '',
    employment_type: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [roleId, setRoleId] = useState<string | null>(null)
  const [roleSkipped, setRoleSkipped] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [contentPlaceholder, setContentPlaceholder] = useState(DEFAULT_CONTENT_PLACEHOLDER)

  const template = roleId ? getRoleTemplate(roleId) : undefined

  function set(key: string, val: string) {
    setFields(f => ({ ...f, [key]: val }))
  }

  function selectRole(id: string) {
    setRoleId(id)
    setBannerDismissed(false)
  }

  function applyBulletPrompt(text: string) {
    setContentPlaceholder(text)
    if (fields.type !== 'skill') set('type', 'experience')
  }

  function applySuggestedSkill(skill: string) {
    setFields(f => ({ ...f, title: skill, type: 'skill' }))
    setContentPlaceholder(`Describe your experience with ${skill} — projects, scale, or outcomes.`)
  }

  async function handleSave() {
    if (!fields.title.trim() || !fields.content.trim()) {
      setError('Title and content are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/modules', {
        method: 'POST',
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

  return (
    <div style={{ paddingTop: 8 }}>
      {error && (
        <div style={{
          background: 'oklch(0.4 0.18 10 / 0.15)',
          border: '1px solid var(--rose)',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 13,
          color: 'var(--rose)',
          marginBottom: 20,
        }}>
          {error}
        </div>
      )}

      {/* Role template picker — shown until a role is picked or skipped */}
      {!roleId && !roleSkipped && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              What kind of role are you targeting?
            </div>
            <button
              onClick={() => setRoleSkipped(true)}
              style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              Skip
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
            {ROLE_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => selectRole(t.id)}
                style={{
                  textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border2)',
                  borderRadius: 10, padding: '12px 14px', cursor: 'pointer', fontFamily: 'var(--font)',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  {t.industry}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                  {t.title}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Template banner + suggestions */}
      {template && !bannerDismissed && (
        <div style={{ background: 'var(--teal-dim)', border: '1px solid var(--teal-glow)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)' }}>
              Starting from {template.title} template
            </div>
            <button
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss"
              style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Suggested skills — click to start a skill module
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {template.suggestedSkills.map((skill) => (
              <button
                key={skill}
                onClick={() => applySuggestedSkill(skill)}
                style={{
                  fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                  border: '1px solid var(--border2)', background: 'var(--surface)', color: 'var(--text2)',
                  cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                {skill}
              </button>
            ))}
          </div>

          {template.sections.map((section) => (
            <div key={section.name} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                {section.name} bullet starters
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {section.bulletPrompts.map((prompt) => (
                  <button
                    key={prompt.text}
                    onClick={() => applyBulletPrompt(prompt.text)}
                    style={{
                      textAlign: 'left', fontSize: 12, fontStyle: 'italic', color: 'var(--text2)',
                      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7,
                      padding: '7px 10px', cursor: 'pointer', fontFamily: 'var(--font)', lineHeight: 1.4,
                    }}
                  >
                    {prompt.text}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mod-edit-form">
        <div className="mod-edit-row">
          <label>Title <span style={{ color: 'var(--rose)' }}>*</span></label>
          <input
            className="mod-edit-input"
            placeholder="e.g. Led community growth at Acme"
            value={fields.title}
            onChange={e => set('title', e.target.value)}
            autoFocus
          />
        </div>

        <div className="mod-edit-row">
          <label>Content <span style={{ color: 'var(--rose)' }}>*</span></label>
          <textarea
            className="mod-edit-textarea"
            rows={6}
            placeholder={contentPlaceholder}
            value={fields.content}
            onChange={e => set('content', e.target.value)}
          />
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            Write in first person, past tense. Include metrics where possible.
          </div>
        </div>

        <div className="mod-edit-cols">
          <div className="mod-edit-row">
            <label>Weight</label>
            <select className="mod-edit-select" value={fields.weight} onChange={e => set('weight', e.target.value)}>
              <option value="anchor">Anchor — core story, always include</option>
              <option value="strong">Strong — valuable, usually include</option>
              <option value="supporting">Supporting — context, use selectively</option>
            </select>
          </div>
          <div
            className="mod-edit-row"
            title={
              fields.type === 'positioning'
                ? 'Career Narrative: modules that frame who you are and how you position yourself for a role — summaries, leadership philosophy, career narrative.'
                : undefined
            }
          >
            <label>Type</label>
            <select className="mod-edit-select" value={fields.type} onChange={e => set('type', e.target.value)}>
              <option value="experience">Experience</option>
              <option value="skill">Skill</option>
              <option value="story">Story</option>
              <option value="positioning">Career Narrative</option>
            </select>
            {fields.type === 'positioning' && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Modules that frame who you are and how you position yourself for a role — summaries, leadership philosophy, career narrative.
              </div>
            )}
          </div>
        </div>

        <div className="mod-edit-cols">
          <div className="mod-edit-row">
            <label>Company</label>
            <input
              className="mod-edit-input"
              placeholder="e.g. Acme Corp"
              value={fields.source_company}
              onChange={e => set('source_company', e.target.value)}
            />
          </div>
          <div className="mod-edit-row">
            <label>Role title</label>
            <input
              className="mod-edit-input"
              placeholder="e.g. Head of Community"
              value={fields.source_role_title}
              onChange={e => set('source_role_title', e.target.value)}
            />
          </div>
        </div>

        <div className="mod-edit-cols">
          <div className="mod-edit-row">
            <label>Date start</label>
            <input
              className="mod-edit-input"
              placeholder="YYYY-MM"
              value={fields.date_start}
              onChange={e => set('date_start', e.target.value)}
            />
          </div>
          <div className="mod-edit-row">
            <label>Date end</label>
            <input
              className="mod-edit-input"
              placeholder="YYYY-MM or present"
              value={fields.date_end}
              onChange={e => set('date_end', e.target.value)}
            />
          </div>
          <div className="mod-edit-row">
            <label>Employment type</label>
            <input
              className="mod-edit-input"
              placeholder="e.g. full-time"
              value={fields.employment_type}
              onChange={e => set('employment_type', e.target.value)}
            />
          </div>
        </div>

        <div className="mod-edit-actions">
          <button
            className="btn-primary"
            style={{ fontSize: 13 }}
            onClick={handleSave}
            disabled={saving || !fields.title.trim() || !fields.content.trim()}
          >
            {saving ? 'Saving…' : 'Create module'}
          </button>
          <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => router.push('/library')}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
