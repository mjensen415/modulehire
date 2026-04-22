'use client'

import { useState } from 'react'

type Section = 'account' | 'billing' | 'connected' | 'danger'

export default function Settings() {
  const [activeSection, setActiveSection] = useState<Section>('account')
  const [saved, setSaved] = useState(false)
  const [name, setName] = useState('Matt Jensen')

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Settings</span>
          <span className="topbar-sub">— Account &amp; preferences</span>
        </div>
      </div>

      <div className="dash-content" style={{ padding: 0 }}>
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>

      <nav className="settings-nav">
        <div className="settings-nav-title">Settings</div>
        {(['account', 'billing', 'connected'] as Section[]).map(s => (
          <button
            key={s}
            className={`settings-nav-link ${activeSection === s ? 'active' : ''}`}
            onClick={() => setActiveSection(s)}
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
            <div className="field-group">
              <label className="field-label" htmlFor="nameInput">Full name</label>
              <input
                type="text"
                id="nameInput"
                className="field-input"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Email address</label>
              <input type="email" className="field-input" defaultValue="matt@example.com" disabled />
              <div className="field-hint">Connected via Google. Email cannot be changed here.</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button className="btn-save" onClick={handleSave}>Save changes</button>
              {saved && (
                <span className="save-indicator visible" style={{ marginLeft: 10 }}>
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
                <div className="plan-value">Free</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="plan-label">Resumes this month</div>
                <div className="plan-value" style={{ fontSize: 20 }}>2 / 3</div>
              </div>
            </div>
            <div className="usage-bar-wrap">
              <div className="usage-bar-label"><span>Monthly resume limit</span><span>2 of 3 used</span></div>
              <div className="usage-bar"><div className="usage-bar-fill"></div></div>
            </div>
            <div className="upgrade-card">
              <div className="upgrade-card-title">Upgrade to Pro</div>
              <div className="upgrade-card-sub">Unlimited resumes, permanent storage, URL JD import, and priority generation. Starting at $12/month.</div>
              <button className="btn-upgrade">Upgrade to Pro →</button>
            </div>
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
                  <div className="connected-status ok">Connected as matt@example.com</div>
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
