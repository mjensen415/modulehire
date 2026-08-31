'use client'

import { useEffect, useState } from 'react'
import type { UserPreferences } from '@/lib/preferences'

type WritingStyle = NonNullable<UserPreferences['writing_style']>
type Tone = NonNullable<UserPreferences['tone']>
type CareerLevel = NonNullable<UserPreferences['career_level']>

const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'technical', label: 'Technical' },
  { value: 'executive', label: 'Executive' },
  { value: 'startup', label: 'Startup' },
]

const CAREER_LEVEL_OPTIONS: { value: CareerLevel; label: string }[] = [
  { value: 'mid', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
  { value: 'executive', label: 'Executive' },
]

function TagInput({
  label, hint, values, onChange, max, placeholder,
}: {
  label: string
  hint?: string
  values: string[]
  onChange: (next: string[]) => void
  max: number
  placeholder: string
}) {
  const [draft, setDraft] = useState('')

  function addTag() {
    const v = draft.trim()
    if (!v || values.length >= max || values.includes(v)) return
    onChange([...values, v])
    setDraft('')
  }

  function removeTag(v: string) {
    onChange(values.filter(t => t !== v))
  }

  return (
    <div className="field-group">
      <label className="field-label">{label}</label>
      {hint && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8, marginTop: -2 }}>{hint}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: values.length > 0 ? 8 : 0 }}>
        {values.map(v => (
          <span key={v} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12.5, fontWeight: 500, color: 'var(--text2)',
            background: 'var(--bg3)', border: '1px solid var(--border2)',
            borderRadius: 20, padding: '4px 6px 4px 12px',
          }}>
            {v}
            <button
              type="button"
              onClick={() => removeTag(v)}
              aria-label={`Remove ${v}`}
              style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 4px' }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {values.length < max && (
        <input
          type="text"
          className="field-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); addTag() }
          }}
          onBlur={addTag}
          placeholder={placeholder}
        />
      )}
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{values.length}/{max}</div>
    </div>
  )
}

export default function PreferencesPage() {
  const [prefs, setPrefs] = useState<UserPreferences>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/preferences')
      .then(r => r.json())
      .then(data => setPrefs(data.preferences ?? {}))
      .catch(() => setError('Could not load preferences.'))
      .finally(() => setLoading(false))
  }, [])

  function update<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setPrefs(p => ({ ...p, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: prefs }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save preferences')
      setPrefs(data.preferences ?? prefs)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">AI Preferences</span>
          <span className="topbar-sub">— Tune how the AI writes for you</span>
        </div>
      </div>

      <div className="dash-content" style={{ maxWidth: 640, margin: '0 auto' }}>
        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading…</div>
        ) : (
          <div className="section-card" style={{ padding: '24px 24px 28px' }}>
            <div style={{ fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.5, marginBottom: 24 }}>
              These preferences are applied to every AI-powered action — module rewrites, job matching, and interview prep. Leave fields blank to let the AI decide.
            </div>

            {error && (
              <div style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 16 }}>{error}</div>
            )}

            {/* Writing Style */}
            <div className="field-group">
              <label className="field-label">Writing style</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['concise', 'detailed'] as WritingStyle[]).map(opt => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="writing_style"
                      checked={prefs.writing_style === opt}
                      onChange={() => update('writing_style', opt)}
                    />
                    {opt === 'concise' ? 'Concise' : 'Detailed'}
                  </label>
                ))}
                {prefs.writing_style && (
                  <button
                    type="button"
                    onClick={() => update('writing_style', undefined)}
                    style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12 }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Tone */}
            <div className="field-group" style={{ marginTop: 20 }}>
              <label className="field-label">Tone</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TONE_OPTIONS.map(opt => {
                  const active = prefs.tone === opt.value
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => update('tone', active ? undefined : opt.value)}
                      style={{
                        fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 20,
                        border: `1px solid ${active ? 'var(--teal-glow)' : 'var(--border2)'}`,
                        background: active ? 'var(--teal-dim)' : 'var(--bg3)',
                        color: active ? 'var(--teal)' : 'var(--text2)',
                        cursor: 'pointer', fontFamily: 'var(--font)',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Career Level */}
            <div className="field-group" style={{ marginTop: 20 }}>
              <label className="field-label">Career level</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {CAREER_LEVEL_OPTIONS.map(opt => {
                  const active = prefs.career_level === opt.value
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => update('career_level', active ? undefined : opt.value)}
                      style={{
                        fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 20,
                        border: `1px solid ${active ? 'var(--teal-glow)' : 'var(--border2)'}`,
                        background: active ? 'var(--teal-dim)' : 'var(--bg3)',
                        color: active ? 'var(--teal)' : 'var(--text2)',
                        cursor: 'pointer', fontFamily: 'var(--font)',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border2)', marginTop: 24, paddingTop: 20 }}>
              <TagInput
                label="Target roles"
                values={prefs.target_roles ?? []}
                onChange={v => update('target_roles', v)}
                max={5}
                placeholder="e.g. Product Manager — press Enter"
              />
            </div>

            <div style={{ marginTop: 20 }}>
              <TagInput
                label="Target industries"
                values={prefs.target_industries ?? []}
                onChange={v => update('target_industries', v)}
                max={5}
                placeholder="e.g. SaaS — press Enter"
              />
            </div>

            <div style={{ marginTop: 20 }}>
              <TagInput
                label="Keywords to always include"
                hint="Terms to weave into every rewrite when relevant"
                values={prefs.always_include_keywords ?? []}
                onChange={v => update('always_include_keywords', v)}
                max={10}
                placeholder="e.g. cross-functional — press Enter"
              />
            </div>

            <div style={{ marginTop: 20, marginBottom: 24 }}>
              <TagInput
                label="Phrases to avoid"
                hint="e.g. leverage, synergy, passionate"
                values={prefs.avoid_phrases ?? []}
                onChange={v => update('avoid_phrases', v)}
                max={10}
                placeholder="e.g. synergy — press Enter"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn-save" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              {saved && (
                <span className="save-indicator visible">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="6.5" cy="6.5" r="5.5" /><path d="M4 6.5l2 2 3-3" /></svg>
                  {' '}Saved
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
