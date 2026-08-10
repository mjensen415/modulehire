'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

function IconHouse() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M2 7l5.5-5 5.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 6v6.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}
function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.5 1v1.5M7.5 12.5V14M14 7.5h-1.5M2.5 7.5H1M12.3 2.7l-1.06 1.06M3.76 11.24 2.7 12.3M12.3 12.3l-1.06-1.06M3.76 3.76 2.7 2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
function IconPerson() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="6.5" cy="3.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1 12c0-2.5 2.5-4.5 5.5-4.5S12 9.5 12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

type JobItem = {
  id: string
  title: string
  status: string
  applicant_count: number
}

const STATUS_DOT: Record<string, string> = {
  active: '#1d9e75',
  paused: '#f59e0b',
  draft: 'var(--text3)',
  closed: 'var(--text3)',
}

export default function BusinessSidebar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname()
  const [orgName, setOrgName] = useState<string | null>(null)
  const [jobs, setJobs] = useState<JobItem[]>([])

  useEffect(() => {
    fetch('/api/business/organizations')
      .then((r) => r.json())
      .then((data) => {
        const org = data.orgs?.[0]
        if (!org) return
        setOrgName(org.name)

        return fetch(`/api/business/job-postings?org_id=${org.id}`)
          .then((r) => r.json())
          .then((data) => {
            const list: JobItem[] = (data.jobs ?? [])
              .filter((j: JobItem) => j.status !== 'closed')
              .slice(0, 12)
            setJobs(list)
          })
      })
      .catch(() => null)
  }, [])

  const navLink = (href: string, label: string, Icon: React.FC) => {
    const active = pathname === href || pathname.startsWith(href + '/')
    return (
      <Link
        key={href}
        href={href}
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '8px 10px', borderRadius: 7,
          fontSize: 13, fontWeight: 500, textDecoration: 'none',
          color: active ? 'var(--teal)' : 'var(--text2)',
          background: active ? 'var(--teal-dim)' : 'transparent',
          border: `1px solid ${active ? 'var(--teal-glow)' : 'transparent'}`,
        }}
      >
        <Icon />
        {label}
      </Link>
    )
  }

  return (
    <div style={{
      width: 240,
      flexShrink: 0,
      position: 'fixed',
      top: 0, left: 0, bottom: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg2)',
      borderRight: '1px solid var(--border)',
      overflowY: 'auto',
    }}>

      {/* Header */}
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          ModuleHire
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--teal)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
          for Business
        </div>
        {orgName && (
          <div style={{
            marginTop: 10, padding: '6px 10px',
            background: 'var(--bg3)', border: '1px solid var(--border)',
            borderRadius: 7, fontSize: 12, fontWeight: 600, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {orgName}
          </div>
        )}
      </div>

      {/* Nav */}
      <div style={{ flex: 1, padding: '10px 10px 0', display: 'flex', flexDirection: 'column', gap: 1 }}>

        {navLink('/business/dashboard', 'Dashboard', IconHouse)}

        {/* Jobs section */}
        <div style={{ marginTop: 10 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            padding: '2px 10px 6px',
          }}>
            Active Jobs
          </div>

          {jobs.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 10px 8px', fontStyle: 'italic' }}>
              No active jobs
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {jobs.map((job) => {
                const active = pathname === `/business/jobs/${job.id}` || pathname.startsWith(`/business/jobs/${job.id}/`)
                return (
                  <Link
                    key={job.id}
                    href={`/business/jobs/${job.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', borderRadius: 7,
                      fontSize: 12.5, fontWeight: 500, textDecoration: 'none',
                      color: active ? 'var(--teal)' : 'var(--text2)',
                      background: active ? 'var(--teal-dim)' : 'transparent',
                      border: `1px solid ${active ? 'var(--teal-glow)' : 'transparent'}`,
                    }}
                  >
                    {/* Status dot */}
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: STATUS_DOT[job.status] ?? 'var(--text3)',
                    }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.title}
                    </span>
                    {job.applicant_count > 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: 'var(--text3)',
                        background: 'var(--bg3)', borderRadius: 10,
                        padding: '1px 6px', flexShrink: 0,
                      }}>
                        {job.applicant_count}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          )}

          <Link
            href="/business/jobs/new"
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 10px', borderRadius: 7, marginTop: 2,
              fontSize: 12.5, fontWeight: 500, textDecoration: 'none',
              color: 'var(--text3)',
            }}
          >
            <IconPlus />
            New job
          </Link>
        </div>

        {/* Bottom nav */}
        <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--border)', paddingBottom: 10 }}>
          {navLink('/business/settings', 'Settings', IconSettings)}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 12px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 8 }}>
          {userEmail ?? ''}
        </div>
        <Link
          href="https://modulehire.com/dashboard"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 7,
            border: '1px solid var(--border)',
            background: 'var(--bg3)',
            fontSize: 12, fontWeight: 600,
            color: 'var(--text2)', textDecoration: 'none',
          }}
        >
          <IconPerson />
          ← Personal App
        </Link>
      </div>
    </div>
  )
}
