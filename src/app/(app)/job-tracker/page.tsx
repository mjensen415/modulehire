'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isProTier } from '@/lib/plan'

type Status = 'saved' | 'applied' | 'screening' | 'interviewing' | 'offered' | 'rejected' | 'withdrawn'

type JobApplication = {
  id: string
  company: string
  title: string
  url: string | null
  jd_text: string | null
  job_description_id: string | null
  status: Status
  notes: string | null
  applied_at: string | null
  created_at: string
  updated_at: string
}

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  saved:         { label: 'Saved',         color: 'var(--text3)',  bg: 'var(--bg3)' },
  applied:       { label: 'Applied',       color: 'var(--teal)',   bg: 'var(--teal-dim)' },
  screening:     { label: 'Screening',     color: 'var(--amber)',  bg: 'var(--amber-dim)' },
  interviewing:  { label: 'Interviewing',  color: 'var(--indigo)', bg: 'var(--indigo-dim)' },
  offered:       { label: 'Offered',       color: 'var(--green)',  bg: 'var(--green-dim)' },
  rejected:      { label: 'Rejected',      color: 'var(--rose)',   bg: 'oklch(0.4 0.18 10 / 0.12)' },
  withdrawn:     { label: 'Withdrawn',     color: 'var(--text3)',  bg: 'var(--bg3)' },
}

const STATUSES = Object.keys(STATUS_CONFIG) as Status[]

type FormState = {
  company: string
  title: string
  url: string
  jdText: string
  status: Status
  appliedAt: string
  notes: string
}

const EMPTY_FORM: FormState = { company: '', title: '', url: '', jdText: '', status: 'saved', appliedAt: '', notes: '' }

function IconPencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M9.5 1.5l3 3-7.5 7.5H2v-3l7.5-7.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}
function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M2.5 3.5h9M5.5 3.5V2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M3.5 3.5v8.5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function JobTrackerPage() {
  const router = useRouter()
  const [applications, setApplications] = useState<JobApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isPro, setIsPro] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [jdOpen, setJdOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [proGateOpen, setProGateOpen] = useState(false)

  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then((data) => setIsPro(isProTier(data.tier))).catch(() => null)
    loadApplications()
  }, [])

  async function loadApplications() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/job-tracker')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load applications')
      setApplications(data.applications ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setJdOpen(false)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(app: JobApplication) {
    setEditingId(app.id)
    setForm({
      company: app.company,
      title: app.title,
      url: app.url ?? '',
      jdText: app.jd_text ?? '',
      status: app.status,
      appliedAt: app.applied_at ? app.applied_at.slice(0, 10) : '',
      notes: app.notes ?? '',
    })
    setJdOpen(!!app.jd_text)
    setFormError('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.company.trim() || !form.title.trim()) {
      setFormError('Company and job title are required.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = {
        company: form.company.trim(),
        title: form.title.trim(),
        url: form.url.trim() || null,
        jd_text: form.jdText.trim() || null,
        status: form.status,
        applied_at: form.appliedAt || null,
        notes: form.notes.trim() || null,
      }
      const res = editingId
        ? await fetch(`/api/job-tracker/${editingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/job-tracker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save application')
      setModalOpen(false)
      await loadApplications()
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/job-tracker/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Could not delete application')
      setApplications((apps) => apps.filter((a) => a.id !== id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeleteConfirmId(null)
    }
  }

  function handlePrepClick(app: JobApplication) {
    if (!isPro) {
      setProGateOpen(true)
      return
    }
    router.push(`/interview-prep?jd=${app.job_description_id}`)
  }

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Job Applications</span>
          <span className="topbar-sub">— Track every role you&apos;re pursuing</span>
        </div>
        <div className="topbar-actions">
          <button onClick={openAdd} className="btn-primary" style={{ fontSize: 13 }}>
            + Add Job
          </button>
        </div>
      </div>

      <div className="dash-content">
        {error && (
          <div style={{ background: 'oklch(0.4 0.18 10 / 0.15)', border: '1px solid var(--rose)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--rose)', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
        ) : applications.length === 0 ? (
          <div className="section-card">
            <div style={{ padding: '56px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>💼</div>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>No applications yet</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24, maxWidth: 360, margin: '0 auto 24px' }}>
                Track every role you apply to — company, status, notes, and the job description for interview prep later.
              </div>
              <button onClick={openAdd} className="btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>
                Add your first application
              </button>
            </div>
          </div>
        ) : (
          <div className="section-card" style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 640 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 120px 110px 1.4fr 90px',
              gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border)',
              fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              <div>Company</div>
              <div>Role</div>
              <div>Status</div>
              <div>Date applied</div>
              <div>Notes</div>
              <div style={{ textAlign: 'right' }}>Actions</div>
            </div>

            {applications.map((app) => {
              const cfg = STATUS_CONFIG[app.status]
              const canPrep = app.status === 'interviewing'
              return (
                <div
                  key={app.id}
                  onClick={() => openEdit(app)}
                  style={{
                    display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 120px 110px 1.4fr 90px',
                    gap: 12, padding: '13px 20px', borderBottom: '1px solid var(--border)',
                    fontSize: 13, alignItems: 'center', cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {app.company}
                  </div>
                  <div style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {app.title}
                  </div>
                  <div>
                    <span style={{
                      fontSize: 10.5, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                      color: cfg.color, background: cfg.bg,
                    }}>
                      {cfg.label}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text3)', fontSize: 12 }}>{formatDate(app.applied_at)}</div>
                  <div style={{ color: 'var(--text3)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {app.notes || '—'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    {canPrep && (
                      app.job_description_id ? (
                        <button
                          onClick={() => handlePrepClick(app)}
                          title="Prep for interview"
                          style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font)', padding: 0 }}
                        >
                          Prep →
                        </button>
                      ) : (
                        <span title="Add a job description to enable interview prep" style={{ fontSize: 10.5, color: 'var(--text3)', cursor: 'help' }}>
                          Add JD to prep
                        </span>
                      )
                    )}
                    <button onClick={() => openEdit(app)} aria-label="Edit" style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}>
                      <IconPencil />
                    </button>
                    {deleteConfirmId === app.id ? (
                      <button
                        onClick={() => handleDelete(app.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--rose)', cursor: 'pointer', fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--font)', padding: 0 }}
                      >
                        Confirm?
                      </button>
                    ) : (
                      <button onClick={() => setDeleteConfirmId(app.id)} aria-label="Delete" style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}>
                        <IconTrash />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {modalOpen && (
        <div
          onClick={() => !saving && setModalOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 18, letterSpacing: '-0.02em' }}>
              {editingId ? 'Edit application' : 'Add a job'}
            </div>

            {formError && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--rose)', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, color: 'var(--rose)', marginBottom: 14 }}>
                {formError}
              </div>
            )}

            <label className="form-label">Company name</label>
            <input className="form-input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme Corp" maxLength={200} style={{ marginBottom: 14 }} />

            <label className="form-label">Job title</label>
            <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Senior Product Manager" maxLength={200} style={{ marginBottom: 14 }} />

            <label className="form-label">Job posting URL (optional)</label>
            <input className="form-input" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" style={{ marginBottom: 14 }} />

            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
                  className="form-input"
                  style={{ cursor: 'pointer' }}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Date applied</label>
                <input type="date" className="form-input" value={form.appliedAt} onChange={(e) => setForm({ ...form, appliedAt: e.target.value })} />
              </div>
            </div>

            <label className="form-label">Notes (optional)</label>
            <textarea className="form-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} maxLength={5000} style={{ marginBottom: 14, resize: 'vertical' }} />

            <button
              onClick={() => setJdOpen((v) => !v)}
              style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', padding: 0, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              {jdOpen ? 'Hide job description ▴' : 'Paste job description ▾'}
            </button>
            {jdOpen && (
              <>
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 6 }}>
                  Used for interview prep later — not shown anywhere else.
                </div>
                <textarea
                  className="form-input"
                  value={form.jdText}
                  onChange={(e) => setForm({ ...form, jdText: e.target.value })}
                  rows={6}
                  maxLength={50_000}
                  placeholder="Paste the job description..."
                  style={{ marginBottom: 6, resize: 'vertical', fontSize: 12.5 }}
                />
              </>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => setModalOpen(false)} className="btn-ghost" disabled={saving}>Cancel</button>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pro gate modal */}
      {proGateOpen && (
        <div
          onClick={() => setProGateOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 14, padding: 28, width: '100%', maxWidth: 380, textAlign: 'center' }}
          >
            <div style={{ fontSize: 28, marginBottom: 12 }}>🔒</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
              Interview prep is a Pro feature
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 22 }}>
              Upgrade to Pro to generate talking points and interview prep documents from your own experience.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setProGateOpen(false)} className="btn-ghost">Not now</button>
              <Link href="/billing" className="btn-primary" style={{ textDecoration: 'none' }}>
                Upgrade →
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
