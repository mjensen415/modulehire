'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Job = {
  id: string
  title: string
  status: string
  applicant_count: number
  created_at: string
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  draft: { color: 'var(--text3)', bg: 'var(--bg3)' },
  active: { color: 'var(--teal)', bg: 'var(--teal-dim)' },
  paused: { color: 'var(--amber)', bg: 'var(--amber-dim)' },
  closed: { color: 'var(--text3)', bg: 'var(--bg3)' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function BusinessJobsPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const orgsRes = await fetch('/api/business/organizations')
        const orgsData = await orgsRes.json()
        if (!orgsRes.ok) throw new Error(orgsData.error ?? 'Could not load organizations')
        const org = orgsData.orgs?.[0]
        if (!org) {
          router.replace('/business/onboarding')
          return
        }

        const jobsRes = await fetch(`/api/business/job-postings?org_id=${org.id}`)
        const jobsData = await jobsRes.json()
        if (!jobsRes.ok) throw new Error(jobsData.error ?? 'Could not load jobs')
        if (!cancelled) setJobs(jobsData.jobs ?? [])
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [router])

  useEffect(() => {
    if (!menuOpen) return
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null)
        setConfirmDeleteId(null)
      }
    }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [menuOpen])

  async function handleArchive(jobId: string) {
    setBusyId(jobId)
    setError('')
    try {
      const res = await fetch(`/api/business/job-postings/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      })
      if (!res.ok) throw new Error('Could not archive job')
      setJobs((js) => js.map((j) => (j.id === jobId ? { ...j, status: 'closed' } : j)))
      setMenuOpen(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(jobId: string) {
    setBusyId(jobId)
    setError('')
    try {
      const res = await fetch(`/api/business/job-postings/${jobId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Could not delete job')
      setJobs((js) => js.filter((j) => j.id !== jobId))
      setMenuOpen(null)
      setConfirmDeleteId(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>Jobs</h1>
        <Link href="/business/jobs/new" className="btn-primary" style={{ textDecoration: 'none' }}>
          + New job
        </Link>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#ef4444', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13.5 }}>Loading…</div>
      ) : jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border2)', borderRadius: 12 }}>
          <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>No jobs yet.</p>
          <Link href="/business/jobs/new" className="btn-primary" style={{ display: 'inline-flex', textDecoration: 'none' }}>
            + New job
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {jobs.map((job) => {
            const statusCfg = STATUS_COLORS[job.status] ?? STATUS_COLORS.draft
            const isMenuOpen = menuOpen === job.id
            return (
              <div key={job.id} style={{ position: 'relative' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '14px 18px',
                  }}
                >
                  <Link
                    href={`/business/jobs/${job.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      flex: 1,
                      minWidth: 0,
                      textDecoration: 'none',
                      color: 'var(--text)',
                    }}
                  >
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.title}
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                      color: statusCfg.color, background: statusCfg.bg, textTransform: 'capitalize',
                    }}>
                      {job.status}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text3)', width: 100, textAlign: 'right' }}>
                      {job.applicant_count} applicant{job.applicant_count === 1 ? '' : 's'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text3)', width: 90, textAlign: 'right' }}>
                      {formatDate(job.created_at)}
                    </span>
                    <span style={{ color: 'var(--text3)' }}>→</span>
                  </Link>

                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setConfirmDeleteId(null)
                      setMenuOpen(isMenuOpen ? null : job.id)
                    }}
                    aria-label="Job actions"
                    style={{
                      background: 'none', border: 'none', padding: '6px 8px', borderRadius: 6,
                      color: 'var(--text3)', cursor: 'pointer', fontSize: 16, lineHeight: 1,
                      transition: 'all 0.15s', flexShrink: 0,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--text)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text3)' }}
                  >
                    ···
                  </button>
                </div>

                {isMenuOpen && (
                  <div
                    ref={menuRef}
                    style={{
                      position: 'absolute', right: 8, top: 36, zIndex: 10,
                      background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8,
                      minWidth: 140, padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    }}
                  >
                    {confirmDeleteId === job.id ? (
                      <div style={{ padding: 8 }}>
                        <div style={{ fontSize: 11.5, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.4 }}>
                          Delete? This removes all applicants.
                        </div>
                        <button
                          onClick={() => handleDelete(job.id)}
                          disabled={busyId === job.id}
                          style={{
                            width: '100%', textAlign: 'left', background: 'none', border: 'none',
                            color: '#ef4444', fontSize: 12.5, fontWeight: 600, padding: '6px 8px',
                            cursor: 'pointer', borderRadius: 6, fontFamily: 'var(--font)',
                          }}
                        >
                          {busyId === job.id ? 'Deleting…' : 'Yes, delete'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          style={{
                            width: '100%', textAlign: 'left', background: 'none', border: 'none',
                            color: 'var(--text3)', fontSize: 12.5, padding: '6px 8px',
                            cursor: 'pointer', borderRadius: 6, fontFamily: 'var(--font)',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleArchive(job.id)}
                          disabled={busyId === job.id}
                          style={{
                            width: '100%', textAlign: 'left', background: 'none', border: 'none',
                            color: 'var(--text2)', fontSize: 12.5, padding: '8px 10px',
                            cursor: 'pointer', borderRadius: 6, fontFamily: 'var(--font)',
                          }}
                        >
                          {busyId === job.id ? 'Archiving…' : 'Archive job'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(job.id)}
                          style={{
                            width: '100%', textAlign: 'left', background: 'none', border: 'none',
                            color: '#ef4444', fontSize: 12.5, padding: '8px 10px',
                            cursor: 'pointer', borderRadius: 6, fontFamily: 'var(--font)',
                          }}
                        >
                          Delete job
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
