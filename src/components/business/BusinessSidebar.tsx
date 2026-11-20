'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

// Charcoal sidebar for ModuleHire for Business. An <aside>, not <nav>: globals.css styles every
// <nav> as the fixed 60px marketing top bar. Styles: src/app/business/business.css (.biz-side).

function IconHouse() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M2 7l5.5-5 5.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 6v6.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}
function IconList() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M5 3.5h8M5 7.5h8M5 11.5h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="2" cy="3.5" r="0.9" fill="currentColor" /><circle cx="2" cy="7.5" r="0.9" fill="currentColor" /><circle cx="2" cy="11.5" r="0.9" fill="currentColor" />
    </svg>
  )
}
function IconChart() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M1.5 13.5h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="3" y="8" width="2.4" height="5.5" rx="0.5" stroke="currentColor" strokeWidth="1.3" />
      <rect x="6.8" y="4.5" width="2.4" height="9" rx="0.5" stroke="currentColor" strokeWidth="1.3" />
      <rect x="10.6" y="1.5" width="2.4" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}
function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.5 1v1.5M7.5 12.5V14M14 7.5h-1.5M2.5 7.5H1M12.3 2.7l-1.06 1.06M3.76 11.24 2.7 12.3M12.3 12.3l-1.06-1.06M3.76 3.76 2.7 2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function BizMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <rect x="2" y="14" width="10" height="10" rx="2" fill="#5fbfa8" />
      <rect x="14" y="14" width="10" height="10" rx="2" fill="#2f8c7d" />
      <rect x="8" y="2" width="10" height="10" rx="2" fill="#5fbfa8" opacity="0.55" />
    </svg>
  )
}

type JobItem = { id: string; title: string; status: string; applicant_count: number }
type Usage = { planName: string; used: number; limit: number | null }

const STATUS_DOT: Record<string, string> = {
  active: '#5fbfa8',
  paused: '#d9a441',
  draft: '#8a7f72',
  closed: '#8a7f72',
}

function resetLabel() {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return next.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
}

export default function BusinessSidebar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname()
  const [orgName, setOrgName] = useState<string | null>(null)
  const [jobs, setJobs] = useState<JobItem[]>([])
  const [usage, setUsage] = useState<Usage | null>(null)

  useEffect(() => {
    fetch('/api/business/organizations')
      .then((r) => r.json())
      .then((data) => {
        const org = data.orgs?.[0]
        if (!org) return
        setOrgName(org.name)
        fetch(`/api/business/billing/usage?org_id=${org.id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((u) => {
            if (!u?.plan) return
            setUsage({ planName: u.plan.name, used: u.usage?.scoresThisMonth ?? 0, limit: u.plan.monthlyScores })
          })
          .catch(() => null)
        return fetch(`/api/business/job-postings?org_id=${org.id}`)
          .then((r) => r.json())
          .then((d) => {
            const list: JobItem[] = (d.jobs ?? []).filter((j: JobItem) => j.status !== 'closed').slice(0, 10)
            setJobs(list)
          })
      })
      .catch(() => null)
  }, [])

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')

  const nav = (href: string, label: string, Icon: React.FC, active: boolean) => (
    <Link href={href} className="biz-nav" aria-current={active ? 'page' : undefined}>
      <Icon />
      {label}
    </Link>
  )

  const onJob = pathname.startsWith('/business/jobs')
  const pct = usage?.limit ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0

  return (
    <aside className="biz-side" role="navigation" aria-label="Business">
      <div className="biz-brand">
        <BizMark />
        <span className="biz-brand-name">ModuleHire</span>
        <span className="biz-brand-tag">BUSINESS</span>
      </div>
      {orgName && <div className="biz-org" title={orgName}>{orgName}</div>}

      {nav('/business/dashboard', 'Dashboard', IconHouse, isActive('/business/dashboard'))}
      {nav('/business/jobs', 'Postings', IconList, pathname === '/business/jobs')}
      {nav('/business/analytics', 'Analytics', IconChart, isActive('/business/analytics'))}
      {nav('/business/settings', 'Settings', IconSettings, isActive('/business/settings'))}

      <div className="biz-side-jobs">
        <div className="biz-side-label">Open postings</div>
        {jobs.length === 0 ? (
          <div className="biz-job" style={{ fontStyle: 'italic' }}>None yet</div>
        ) : (
          jobs.map((job) => (
            <Link
              key={job.id}
              href={`/business/jobs/${job.id}`}
              className="biz-job"
              aria-current={onJob && isActive(`/business/jobs/${job.id}`) ? 'page' : undefined}
            >
              <span className="biz-dot" style={{ background: STATUS_DOT[job.status] ?? '#8a7f72' }} />
              <span className="biz-job-title">{job.title}</span>
              {job.applicant_count > 0 && <span className="biz-job-count">{job.applicant_count}</span>}
            </Link>
          ))
        )}
        <Link href="/business/jobs/new" className="biz-job" aria-current={pathname === '/business/jobs/new' ? 'page' : undefined}>
          <IconPlus />
          New posting
        </Link>
      </div>

      <div style={{ flexGrow: 1 }} />

      {usage && (
        <div className="biz-usage">
          <div className="biz-usage-row">
            <span style={{ color: 'var(--biz-side-muted)' }}>{usage.planName} plan</span>
            <span>{usage.limit === null ? `${usage.used} scored` : `${usage.used} / ${usage.limit} scored`}</span>
          </div>
          {usage.limit !== null && (
            <div
              className="biz-usage-bar"
              role="progressbar"
              aria-label="Scores used this month"
              aria-valuenow={usage.used}
              aria-valuemin={0}
              aria-valuemax={usage.limit}
            >
              <span style={{ width: `${pct}%` }} />
            </div>
          )}
          <span style={{ color: 'var(--biz-side-muted)' }}>Resets {resetLabel()}</span>
        </div>
      )}

      <div className="biz-side-foot">
        <span className="biz-email">{userEmail ?? ''}</span>
        <Link href="https://modulehire.com/dashboard" className="biz-nav" style={{ padding: '6px 0' }}>
          ← Personal app
        </Link>
      </div>
    </aside>
  )
}
