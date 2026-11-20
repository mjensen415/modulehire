'use client'

// Postings list. Styles: business.css (.biz-*) plus the bp-jobs/bp-menu rules in ./[id]/posting.css.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { providerLabel } from '@/lib/business/ats/registry'
import './[id]/posting.css'

type Job = {
  id: string
  title: string
  status: string
  applicant_count: number
  created_at: string
  extracted_company?: string | null
  external_source?: string | null
}

const STATUS_CHIP: Record<string, { label: string; chip: string }> = {
  draft: { label: 'Draft', chip: '' },
  active: { label: 'Active', chip: 'teal' },
  paused: { label: 'Paused', chip: 'sand' },
  closed: { label: 'Closed', chip: '' },
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
    function close() {
      setMenuOpen(null)
      setConfirmDeleteId(null)
    }
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('click', handleOutsideClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('click', handleOutsideClick)
      document.removeEventListener('keydown', handleKey)
    }
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

  const openCount = jobs.filter((j) => j.status !== 'closed').length
  const closedCount = jobs.length - openCount

  return (
    <div className="biz-inner">
      <header className="biz-head">
        <div>
          <h1 className="biz-h1">Postings</h1>
          <p className="biz-sub">
            {loading
              ? 'Loading your postings.'
              : jobs.length === 0
                ? 'No postings yet.'
                : `${openCount} open${closedCount ? `, ${closedCount} closed` : ''}.`}
          </p>
        </div>
        <div className="biz-actions">
          <Link href="/business/jobs/new" className="biz-btn">+ New posting</Link>
        </div>
      </header>

      {error && (
        <div className="bp-error" role="alert">
          <span>{error}</span>
          <button type="button" className="bp-x" onClick={() => setError('')} aria-label="Dismiss error">×</button>
        </div>
      )}

      <section aria-labelledby="jobs-h" className="biz-card">
        <div className="biz-card-head">
          <h2 id="jobs-h" className="biz-h2">All postings</h2>
          {jobs.length > 0 && <span className="biz-muted" style={{ fontSize: 13 }}>Newest first</span>}
        </div>

        {loading ? (
          <div aria-busy="true" aria-label="Loading postings">
            {[0, 1, 2].map((i) => <div key={i} className="bp-skel" style={{ opacity: 1 - i * 0.25 }} />)}
          </div>
        ) : jobs.length === 0 ? (
          <div className="biz-empty">
            <h2>Post your first job</h2>
            <p>Paste the job description, set what matters, then upload applicants or import them from your ATS. We score and rank every one.</p>
            <Link href="/business/jobs/new" className="biz-btn">+ Create a posting</Link>
          </div>
        ) : (
          <div className="biz-table-wrap" style={{ overflow: 'visible' }}>
            <table className="biz-table bp-jobs-table">
              <thead>
                <tr>
                  <th scope="col">Posting</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="bp-col-wide">Source</th>
                  <th scope="col">Applicants</th>
                  <th scope="col" className="bp-col-wide">Opened</th>
                  <th scope="col"><span className="bp-sr">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const cfg = STATUS_CHIP[job.status] ?? { label: job.status, chip: '' }
                  const isMenuOpen = menuOpen === job.id
                  const source = providerLabel(job.external_source)
                  return (
                    <tr key={job.id}>
                      <td>
                        <Link href={`/business/jobs/${job.id}`} className="biz-row-link">{job.title}</Link>
                        {job.extracted_company && <div className="bp-jobs-sub">{job.extracted_company}</div>}
                      </td>
                      <td><span className={`biz-chip ${cfg.chip}`}>{cfg.label}</span></td>
                      <td className="bp-col-wide">
                        {source ? <span className="biz-chip">{source}</span> : <span className="biz-faint">–</span>}
                      </td>
                      <td>{job.applicant_count ?? 0}</td>
                      <td className="bp-col-wide biz-muted">{formatDate(job.created_at)}</td>
                      <td>
                        <div className="bp-menu-wrap" ref={isMenuOpen ? menuRef : undefined}>
                          <button
                            type="button"
                            className="bp-kebab"
                            aria-label={`Actions for ${job.title}`}
                            aria-haspopup="menu"
                            aria-expanded={isMenuOpen}
                            onClick={(e) => {
                              e.stopPropagation()
                              setConfirmDeleteId(null)
                              setMenuOpen(isMenuOpen ? null : job.id)
                            }}
                          >
                            ···
                          </button>
                          {isMenuOpen && (
                            <div className="bp-menu" role="menu">
                              {confirmDeleteId === job.id ? (
                                <>
                                  <div className="bp-menu-note">Delete this posting? This removes all its applicants.</div>
                                  <button type="button" role="menuitem" className="bp-menu-item danger" onClick={() => handleDelete(job.id)} disabled={busyId === job.id}>
                                    {busyId === job.id ? 'Deleting…' : 'Yes, delete'}
                                  </button>
                                  <button type="button" role="menuitem" className="bp-menu-item" onClick={() => setConfirmDeleteId(null)}>
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  {job.status !== 'closed' && (
                                    <button type="button" role="menuitem" className="bp-menu-item" onClick={() => handleArchive(job.id)} disabled={busyId === job.id}>
                                      {busyId === job.id ? 'Archiving…' : 'Archive posting'}
                                    </button>
                                  )}
                                  <button type="button" role="menuitem" className="bp-menu-item danger" onClick={() => setConfirmDeleteId(job.id)}>
                                    Delete posting
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
