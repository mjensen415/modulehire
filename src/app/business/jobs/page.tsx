'use client'

import { useEffect, useState } from 'react'
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
            return (
              <Link
                key={job.id}
                href={`/business/jobs/${job.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '14px 18px',
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
            )
          })}
        </div>
      )}
    </div>
  )
}
