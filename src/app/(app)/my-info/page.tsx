'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Profile = {
  name: string
  email: string
  phone: string
  linkedin_url: string
  location: string
  summary: string
}

type EducationEntry = { school: string; degree: string; field: string; year: string }

export default function MyInfoPage() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [location, setLocation] = useState('')
  const [summary, setSummary] = useState('')
  const [education, setEducation] = useState<EducationEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(r => r.json()),
      fetch('/api/education').then(r => r.json()),
    ])
      .then(([profileData, eduData]: [Profile, { education?: EducationEntry[] }]) => {
        setProfile(profileData)
        setName(profileData.name ?? '')
        setPhone(profileData.phone ?? '')
        setLinkedin(profileData.linkedin_url ?? '')
        setLocation(profileData.location ?? '')
        setSummary(profileData.summary ?? '')
        setEducation(
          (eduData.education ?? []).map(e => ({
            school: e.school ?? '',
            degree: e.degree ?? '',
            field:  e.field  ?? '',
            year:   e.year   ?? '',
          }))
        )
      })
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const [profileRes, eduRes] = await Promise.all([
        fetch('/api/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, linkedin_url: linkedin, location, summary }),
        }),
        fetch('/api/education', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ education }),
        }),
      ])
      const profileData = await profileRes.json()
      const eduData = await eduRes.json()
      if (!profileRes.ok) throw new Error(profileData.error ?? 'Save failed')
      if (!eduRes.ok) throw new Error(eduData.error ?? 'Education save failed')
      setProfile(p => p ? { ...p, ...profileData } : profileData)
      if (Array.isArray(eduData.education)) {
        setEducation(
          eduData.education.map((e: EducationEntry) => ({
            school: e.school ?? '',
            degree: e.degree ?? '',
            field:  e.field  ?? '',
            year:   e.year   ?? '',
          }))
        )
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function updateEducation(idx: number, patch: Partial<EducationEntry>) {
    setEducation(es => es.map((e, i) => i === idx ? { ...e, ...patch } : e))
  }
  function addEducation() {
    setEducation(es => [...es, { school: '', degree: '', field: '', year: '' }])
  }
  function removeEducation(idx: number) {
    setEducation(es => es.filter((_, i) => i !== idx))
  }

  const filled = [name, phone, linkedin, location, summary].filter(Boolean).length
  const total = 5

  return (
    <>
      <div className="app-topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span className="topbar-title">My Info</span>
          <span className="topbar-sub">— Used on every resume you generate</span>
        </div>
        <button
          onClick={handleSignOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--rose)',
            background: 'transparent',
            border: '1px solid var(--rose)',
            borderRadius: 6,
            padding: '6px 12px',
            cursor: 'pointer',
            opacity: 0.75,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.75')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign out
        </button>
      </div>

      <div className="dash-content" style={{ maxWidth: 560, padding: '40px 40px' }}>

        {/* Callout */}
        <div style={{
          background: 'var(--teal-dim)',
          border: '1px solid var(--teal-glow)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 32,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--teal)" strokeWidth="1.6" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 5v3M8 11h.01" />
          </svg>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
            This info is extracted automatically when you upload a resume and pre-filled on every resume you generate. Update it here any time.
          </div>
        </div>

        {/* Completeness bar */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>Profile completeness</span>
            <span style={{ fontSize: 12, color: filled === total ? 'var(--teal)' : 'var(--text3)', fontWeight: 600 }}>
              {filled}/{total} fields
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(filled / total) * 100}%`,
              background: filled === total ? 'var(--teal)' : 'var(--indigo)',
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Name */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, letterSpacing: '0.01em' }}>
                Full name
              </label>
              <input
                className="mod-edit-input"
                style={{ width: '100%' }}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>

            {/* Email — read only */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, letterSpacing: '0.01em' }}>
                Email
              </label>
              <input
                className="mod-edit-input"
                style={{ width: '100%', opacity: 0.5, cursor: 'not-allowed' }}
                value={profile?.email ?? ''}
                disabled
              />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Set by your login — can't be changed here</div>
            </div>

            {/* Phone */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, letterSpacing: '0.01em' }}>
                Phone
              </label>
              <input
                className="mod-edit-input"
                style={{ width: '100%' }}
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+1 415 555 0101"
              />
            </div>

            {/* LinkedIn */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, letterSpacing: '0.01em' }}>
                LinkedIn URL
              </label>
              <input
                className="mod-edit-input"
                style={{ width: '100%' }}
                type="url"
                value={linkedin}
                onChange={e => setLinkedin(e.target.value)}
                placeholder="linkedin.com/in/janedoe"
              />
            </div>

            {/* Location */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, letterSpacing: '0.01em' }}>
                Location
              </label>
              <input
                className="mod-edit-input"
                style={{ width: '100%' }}
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="San Francisco, CA"
              />
            </div>

            {/* Summary */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, letterSpacing: '0.01em' }}>
                Summary
              </label>
              <textarea
                className="mod-edit-input"
                style={{ width: '100%', minHeight: 110, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                value={summary}
                onChange={e => setSummary(e.target.value)}
                placeholder="2-4 sentences about who you are and the kind of work you do. Auto-extracted from your most recent resume — edit any time."
                maxLength={2000}
              />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Used as the opening paragraph of generated resumes. You can override it per-job in the generate flow.
              </div>
            </div>

            {/* Education */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, letterSpacing: '0.01em' }}>
                Education
              </label>
              {education.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8, fontStyle: 'italic' }}>
                  No education entries yet. Auto-extracted on resume upload, or add one below.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {education.map((e, i) => (
                  <div
                    key={i}
                    style={{
                      border: '1px solid var(--border2)',
                      borderRadius: 6,
                      padding: 10,
                      background: 'var(--bg3)',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>School</div>
                        <input
                          className="mod-edit-input"
                          style={{ width: '100%' }}
                          value={e.school}
                          onChange={ev => updateEducation(i, { school: ev.target.value })}
                          placeholder="Stanford University"
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Degree</div>
                        <input
                          className="mod-edit-input"
                          style={{ width: '100%' }}
                          value={e.degree}
                          onChange={ev => updateEducation(i, { degree: ev.target.value })}
                          placeholder="B.A."
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Field</div>
                        <input
                          className="mod-edit-input"
                          style={{ width: '100%' }}
                          value={e.field}
                          onChange={ev => updateEducation(i, { field: ev.target.value })}
                          placeholder="Computer Science"
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Year</div>
                        <input
                          className="mod-edit-input"
                          style={{ width: '100%' }}
                          value={e.year}
                          onChange={ev => updateEducation(i, { year: ev.target.value })}
                          placeholder="2018"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEducation(i)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--rose)',
                        fontSize: 11,
                        marginTop: 8,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addEducation}
                  style={{
                    background: 'transparent',
                    border: '1px dashed var(--border2)',
                    color: 'var(--text2)',
                    fontSize: 12,
                    padding: '8px 12px',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  + Add education
                </button>
              </div>
            </div>

            {error && (
              <div style={{ fontSize: 13, color: 'var(--rose)' }}>{error}</div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              {saved && (
                <span style={{ fontSize: 13, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <circle cx="6.5" cy="6.5" r="5.5" />
                    <path d="M4 6.5l2 2 3-3" />
                  </svg>
                  Saved
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
