'use client'

import { useState, useEffect } from 'react'

type Section = 'account' | 'billing' | 'connected' | 'profiles' | 'danger'

type Profile = {
  name: string
  email: string
  phone: string
  linkedin_url: string
  location: string
  plan: string
  tier?: 'free' | 'pro' | 'beta_pro'
  tier_expires_at?: string | null
}

type ModuleProfile = { id: string; name: string; module_count: number; is_active: boolean }

export default function Settings() {
  const [activeSection, setActiveSection] = useState<Section>('account')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState('')

  const [moduleProfiles, setModuleProfiles] = useState<ModuleProfile[]>([])
  const [profilesLoading, setProfilesLoading] = useState(false)
  const [profilesError, setProfilesError] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newProfileName, setNewProfileName] = useState('')
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null)

  async function loadModuleProfiles() {
    setProfilesLoading(true)
    setProfilesError('')
    try {
      const res = await fetch('/api/profiles')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load profiles')
      setModuleProfiles(data.profiles ?? [])
    } catch (e) {
      setProfilesError((e as Error).message)
    } finally {
      setProfilesLoading(false)
    }
  }

  async function handleCreateProfile() {
    if (!newProfileName.trim()) return
    setCreatingProfile(true)
    setProfilesError('')
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProfileName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create profile')
      setNewProfileName('')
      await loadModuleProfiles()
    } catch (e) {
      setProfilesError((e as Error).message)
    } finally {
      setCreatingProfile(false)
    }
  }

  async function handleRenameProfile(id: string) {
    if (!renameValue.trim()) return
    setBusyProfileId(id)
    try {
      const res = await fetch(`/api/profiles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not rename profile')
      setRenamingId(null)
      await loadModuleProfiles()
    } catch (e) {
      setProfilesError((e as Error).message)
    } finally {
      setBusyProfileId(null)
    }
  }

  async function handleDeleteProfile(id: string) {
    setBusyProfileId(id)
    setProfilesError('')
    try {
      const res = await fetch(`/api/profiles/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not delete profile')
      await loadModuleProfiles()
    } catch (e) {
      setProfilesError((e as Error).message)
    } finally {
      setBusyProfileId(null)
    }
  }

  async function openBillingPortal() {
    setPortalError('')
    setPortalLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setPortalError(data.error ?? 'Could not open billing portal.')
        return
      }
      window.location.href = data.url
    } catch {
      setPortalError('Could not open billing portal. Please try again.')
    } finally {
      setPortalLoading(false)
    }
  }

  const tier = profile?.tier ?? 'free'
  const tierLabel = tier === 'beta_pro' ? 'Pro (Beta)' : tier === 'pro' ? 'Pro' : 'Free'
  const expiresAt = profile?.tier_expires_at ? new Date(profile.tier_expires_at) : null
  const expiresLabel = expiresAt
    ? expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then((data: Profile) => {
        setProfile(data)
        setName(data.name ?? '')
        setPhone(data.phone ?? '')
        setLinkedinUrl(data.linkedin_url ?? '')
        setLocation(data.location ?? '')
      })
      .catch(() => {})
  }, [])

  function selectSection(s: Section) {
    setActiveSection(s)
    if (s === 'profiles' && moduleProfiles.length === 0 && !profilesLoading) {
      loadModuleProfiles()
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, linkedin_url: linkedinUrl, location }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setProfile(p => p ? { ...p, ...data } : data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Account</span>
          <span className="topbar-sub">— Profile &amp; billing</span>
        </div>
      </div>

      <div className="dash-content" style={{ padding: 0 }}>
        <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>

          <nav className="settings-nav">
            <div className="settings-nav-title">Settings</div>
            {(['account', 'billing', 'connected', 'profiles'] as Section[]).map(s => (
              <button
                key={s}
                className={`settings-nav-link ${activeSection === s ? 'active' : ''}`}
                onClick={() => selectSection(s)}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                {s === 'connected' ? 'Connected accounts' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <div className="settings-divider"></div>
            <button
              className={`settings-nav-link danger ${activeSection === 'danger' ? 'active' : ''}`}
              onClick={() => setActiveSection('danger')}
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              Danger zone
            </button>
          </nav>

          <div className="settings-content">
            {activeSection === 'account' && (
              <div className="settings-section active">
                <div className="section-title">Account</div>

                {/* Identity */}
                <div className="field-group">
                  <label className="field-label" htmlFor="nameInput">Full name</label>
                  <input
                    type="text"
                    id="nameInput"
                    className="field-input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Your full name"
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Email address</label>
                  <input type="email" className="field-input" value={profile?.email ?? ''} disabled />
                  <div className="field-hint">Connected via Google. Email cannot be changed here.</div>
                </div>

                {/* Contact info */}
                <div style={{ borderTop: '1px solid var(--border2)', marginTop: 24, paddingTop: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 4 }}>Contact information</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
                    Pre-filled on every resume you generate. Extracted automatically from uploaded resumes.
                  </div>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="phoneInput">Phone number</label>
                  <input
                    type="tel"
                    id="phoneInput"
                    className="field-input"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+1 555 000 0000"
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="linkedinInput">LinkedIn URL</label>
                  <input
                    type="url"
                    id="linkedinInput"
                    className="field-input"
                    value={linkedinUrl}
                    onChange={e => setLinkedinUrl(e.target.value)}
                    placeholder="linkedin.com/in/yourhandle"
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="locationInput">Location</label>
                  <input
                    type="text"
                    id="locationInput"
                    className="field-input"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    placeholder="City, State"
                  />
                </div>

                {saveError && (
                  <div style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 12 }}>{saveError}</div>
                )}

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

            {activeSection === 'billing' && (
              <div className="settings-section active">
                <div className="section-title">Billing</div>
                <div className="plan-row">
                  <div>
                    <div className="plan-label">Current plan</div>
                    <div className="plan-value">{tierLabel}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <button
                      className="btn-primary"
                      onClick={openBillingPortal}
                      disabled={portalLoading}
                    >
                      {portalLoading ? 'Opening…' : 'Manage Billing'}
                    </button>
                  </div>
                </div>

                {tier === 'beta_pro' && expiresLabel && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--teal-dim)', border: '1px solid var(--teal-glow)', borderRadius: 6, fontSize: 13, color: 'var(--teal)' }}>
                    Pro access — complimentary through {expiresLabel}.
                  </div>
                )}

                {portalError && (
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--rose)' }}>{portalError}</div>
                )}

                {tier === 'free' && (
                  <div className="upgrade-card" style={{ marginTop: 16 }}>
                    <div className="upgrade-card-title">Upgrade to Pro</div>
                    <div className="upgrade-card-sub">Unlimited tailored resumes, priority generation, and full history. $19/mo or $99/yr.</div>
                    <a href="/billing" className="btn-upgrade">View plans →</a>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'connected' && (
              <div className="settings-section active">
                <div className="section-title">Connected accounts</div>
                <div className="connected-row">
                  <div className="connected-left">
                    <div className="connected-icon" style={{ background: '#fff' }}>
                      <svg width="20" height="20" viewBox="0 0 18 18" fill="none"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" /><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" /><path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05" /><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" /></svg>
                    </div>
                    <div>
                      <div className="connected-name">Google</div>
                      <div className="connected-status ok">Connected as {profile?.email ?? '…'}</div>
                    </div>
                  </div>
                  <div className="connected-badge">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="6" cy="6" r="5" /><path d="M4 6l1.5 1.5L8 4" /></svg>
                    Connected
                  </div>
                </div>
                <div className="connected-row">
                  <div className="connected-left">
                    <div className="connected-icon" style={{ background: '#0A66C2', borderRadius: 8 }}>
                      <svg width="20" height="20" viewBox="0 0 18 18" fill="none"><rect width="18" height="18" rx="3" fill="#0A66C2" /><path d="M5.5 7.5h-2v6h2v-6zM4.5 6.5A1.25 1.25 0 104.5 4a1.25 1.25 0 000 2.5zM13.5 13.5h-2v-3c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v3h-2v-6h2v.79A2.98 2.98 0 0110.5 7c1.65 0 3 1.35 3 3v3.5z" fill="white" /></svg>
                    </div>
                    <div>
                      <div className="connected-name">LinkedIn</div>
                      <div className="connected-status">Not connected</div>
                    </div>
                  </div>
                  <button className="btn-connect">Connect</button>
                </div>
              </div>
            )}

            {activeSection === 'profiles' && (
              <div className="settings-section active">
                <div className="section-title">Profiles</div>
                <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 20, lineHeight: 1.5 }}>
                  Each profile has its own set of modules. Switch profiles to work with a different resume identity. Job descriptions and job applications are shared across all profiles.
                </div>

                {profilesError && (
                  <div style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 12 }}>{profilesError}</div>
                )}

                {profilesLoading ? (
                  <div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading…</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                    {moduleProfiles.map(p => {
                      const canDelete = !p.is_active && moduleProfiles.length > 1
                      const deleteTooltip = p.is_active
                        ? 'Switch away from this profile before deleting it'
                        : moduleProfiles.length <= 1
                          ? 'You cannot delete your only profile'
                          : undefined
                      return (
                        <div key={p.id} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                          border: '1px solid var(--border2)', borderRadius: 10, background: 'var(--bg2)',
                        }}>
                          {renamingId === p.id ? (
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleRenameProfile(p.id)}
                              maxLength={100}
                              className="field-input"
                              style={{ flex: 1 }}
                            />
                          ) : (
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{p.name}</span>
                                {p.is_active && (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-dim)', borderRadius: 20, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Active
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                                {p.module_count} module{p.module_count === 1 ? '' : 's'}
                              </div>
                            </div>
                          )}

                          {renamingId === p.id ? (
                            <>
                              <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} disabled={busyProfileId === p.id} onClick={() => handleRenameProfile(p.id)}>
                                Save
                              </button>
                              <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setRenamingId(null)}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="btn-ghost"
                                style={{ fontSize: 12, padding: '6px 12px' }}
                                onClick={() => { setRenamingId(p.id); setRenameValue(p.name) }}
                              >
                                Rename
                              </button>
                              <button
                                className="btn-ghost"
                                style={{ fontSize: 12, padding: '6px 12px', opacity: canDelete ? 1 : 0.45, cursor: canDelete ? 'pointer' : 'not-allowed' }}
                                disabled={!canDelete || busyProfileId === p.id}
                                title={deleteTooltip}
                                onClick={() => canDelete && handleDeleteProfile(p.id)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--border2)', paddingTop: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Create a new profile</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input
                      value={newProfileName}
                      onChange={e => setNewProfileName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateProfile()}
                      placeholder="e.g. Product work"
                      maxLength={100}
                      className="field-input"
                      style={{ flex: 1 }}
                    />
                    <button className="btn-primary" onClick={handleCreateProfile} disabled={creatingProfile || !newProfileName.trim()}>
                      {creatingProfile ? 'Creating…' : 'Create profile'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'danger' && (
              <div className="settings-section active">
                <div className="section-title">Danger zone</div>
                <div className="danger-card">
                  <div className="danger-title">Delete account</div>
                  <div className="danger-desc">Permanently delete your account and all associated data — modules, resumes, and settings. This action cannot be undone.</div>
                  <button className="btn-danger">Delete my account</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
