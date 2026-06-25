'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ScoreChip } from '@/components/ScoreGauge'
import { computeStorageUsage, type StorageUsage } from '@/lib/plan'

type GeneratedResume = {
  id: string
  title: string
  positioning_variant: string | null
  created_at: string
  expires_at: string | null
  is_temp: boolean
  docx_signed: string | null
  pdf_signed: string | null
  expired: boolean
  job_description_id: string | null
  ats_score: number | null
  job_descriptions: {
    extracted_company: string | null
    extracted_role_type: string | null
  } | null
}

async function downloadFile(url: string, filename: string) {
  const res = await fetch(url)
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(blobUrl)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function timeUntilExpiry(expires_at: string) {
  const ms = new Date(expires_at).getTime() - Date.now()
  if (ms <= 0) return null
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'expires soon'
  if (h < 24) return `expires in ${h}h`
  return `expires in ${Math.floor(h / 24)}d`
}

function formatMB(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1)
}

export default function ResumesPage() {
  const [resumes, setResumes] = useState<GeneratedResume[]>([])
  const [storage, setStorage] = useState<StorageUsage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/my-resumes')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setResumes(data.resumes ?? [])
        setStorage(data.storage ?? null)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return
    try {
      const res = await fetch('/api/my-resumes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Delete failed')
      setResumes(prev => prev.filter(r => r.id !== id))
      // Recompute the banner from the new count (bytes refresh on next load).
      setStorage(prev => prev ? computeStorageUsage(Math.max(0, prev.resume_count - 1), prev.bytes) : prev)
    } catch {
      setError('Could not delete that resume. Please try again.')
    }
  }

  const active = resumes.filter(r => !r.expired)
  const expired = resumes.filter(r => r.expired)

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Generated Resumes</span>
          <span className="topbar-sub">— Your resume history</span>
        </div>
        <Link href="/generate" className="btn-primary" style={{ textDecoration: 'none', fontSize: 13, display: 'inline-flex', padding: '7px 14px' }}>
          + Generate New
        </Link>
      </div>

      <div className="dash-content">
        {/* Storage usage notice — non-blocking; resumes are never auto-deleted */}
        {storage?.near && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
            padding: '12px 16px', borderRadius: 8,
            border: `1px solid ${storage.over ? 'var(--rose)' : 'var(--border2)'}`,
            background: 'var(--surface)',
          }}>
            <span style={{ fontSize: 16 }}>{storage.over ? '⚠️' : '📦'}</span>
            <div style={{ flex: 1, fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
              <strong style={{ color: storage.over ? 'var(--rose)' : 'var(--text)' }}>
                {storage.over ? 'You’ve reached your storage limit.' : 'You’re approaching your storage limit.'}
              </strong>{' '}
              {storage.resume_count}/{storage.count_limit} resumes · {formatMB(storage.bytes)}/{formatMB(storage.byte_limit)} MB used.
              {' '}Your resumes are all still saved{storage.over ? ' — to free space, download and keep the ones you need locally.' : '.'}
            </div>
          </div>
        )}

        {loading && <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>}
        {error && <div style={{ color: 'var(--rose)', fontSize: 13 }}>{error}</div>}

        {!loading && resumes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 40px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>No resumes yet</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>Generate your first tailored resume from the Generate page.</div>
            <Link href="/generate" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', fontSize: 13, padding: '8px 16px' }}>Generate a Resume →</Link>
          </div>
        )}

        {active.length > 0 && (
          <div className="section-card" style={{ marginBottom: 24 }}>
            <div className="section-head">
              <div className="section-head-title">Recent</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{active.length} resume{active.length !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {active.map((r, i) => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '14px 20px',
                  borderBottom: i < active.length - 1 ? '1px solid var(--border2)' : 'none',
                }}>
                  {/* Icon */}
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--indigo-dim)', border: '1px solid var(--indigo-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 15 15" fill="none">
                      <path d="M8 1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6L8 1Z" stroke="var(--indigo)" strokeWidth="1.3"/>
                      <path d="M8 1v5h5" stroke="var(--indigo)" strokeWidth="1.3" strokeLinejoin="round"/>
                      <path d="M5 9h5M5 11.5h3" stroke="var(--indigo)" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{formatDate(r.created_at)}</span>
                      {r.positioning_variant && <span>Variant {r.positioning_variant}</span>}
                      {r.is_temp && r.expires_at && (
                        <span style={{ color: 'var(--rose)', opacity: 0.8 }}>{timeUntilExpiry(r.expires_at)}</span>
                      )}
                      <ScoreChip score={r.ats_score} />
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                    {r.job_description_id && (
                      <Link
                        href={`/generate?jd_id=${r.job_description_id}`}
                        style={{
                          fontSize: 12, padding: '5px 12px',
                          border: '1px solid var(--border2)',
                          borderRadius: 6,
                          color: 'var(--text3)',
                          textDecoration: 'none',
                          fontFamily: 'var(--font)',
                          whiteSpace: 'nowrap',
                        }}
                        title="Re-run with same job description"
                      >
                        ↺ Regenerate
                      </Link>
                    )}
                    {r.docx_signed && (
                      <button
                        className="btn-ghost"
                        style={{ fontSize: 12, padding: '5px 12px' }}
                        onClick={() => downloadFile(r.docx_signed!, `${r.title}.docx`)}
                      >
                        DOCX
                      </button>
                    )}
                    {r.pdf_signed && (
                      <button
                        className="btn-ghost"
                        style={{ fontSize: 12, padding: '5px 12px' }}
                        onClick={() => downloadFile(r.pdf_signed!, `${r.title}.pdf`)}
                      >
                        PDF
                      </button>
                    )}
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 12, padding: '5px 10px', color: 'var(--rose)' }}
                      onClick={() => handleDelete(r.id, r.title)}
                      title="Delete this resume"
                      aria-label={`Delete ${r.title}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {expired.length > 0 && (
          <div className="section-card">
            <div className="section-head">
              <div className="section-head-title" style={{ color: 'var(--text3)' }}>Expired</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Links no longer available — regenerate to download</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {expired.map((r, i) => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '12px 20px',
                  opacity: 0.5,
                  borderBottom: i < expired.length - 1 ? '1px solid var(--border2)' : 'none',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>{formatDate(r.created_at)} · Expired</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
