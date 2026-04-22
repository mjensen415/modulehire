import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

type JobDescription = {
  title?: string | null
  company?: string | null
}

type GeneratedResume = {
  id: string
  title?: string | null
  created_at: string
  positioning_variant?: string | null
  status?: string | null
  docx_url?: string | null
  pdf_url?: string | null
  job_descriptions?: JobDescription | null
}

function statusDot(status?: string | null): string {
  switch (status) {
    case 'sent': return 'sent'
    case 'viewed': return 'viewed'
    case 'interview': return 'interview'
    default: return 'draft'
  }
}

function statusLabel(status?: string | null): string {
  return status ?? 'draft'
}

function IconFiles() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <path d="M8 1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6L8 1Z" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 1v5h5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  )
}

function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export default async function Applications() {
  const supabase = await createClient()

  const { data: rawResumes } = await supabase
    .from('generated_resumes')
    .select('id, title, created_at, positioning_variant, status, docx_url, pdf_url, job_description_id, job_descriptions(title, company)')
    .order('created_at', { ascending: false })
    .limit(50)

  const resumes: GeneratedResume[] = (rawResumes ?? []) as unknown as GeneratedResume[]

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Applications</span>
          <span className="topbar-sub">— Track your progress</span>
        </div>
        <div className="topbar-actions">
          <Link href="/generate" className="btn-primary">
            <IconPlus /> New resume
          </Link>
        </div>
      </div>

      <div className="dash-content">
        {resumes.length === 0 ? (
          <div className="section-card">
            <div style={{ padding: '56px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
                No resumes yet
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24, maxWidth: 340, margin: '0 auto 24px' }}>
                Generate a tailored resume from your module library and it will appear here.
              </div>
              <Link href="/generate" className="btn-primary" style={{ display: 'inline-flex' }}>
                <IconPlus /> Generate first resume
              </Link>
            </div>
          </div>
        ) : (
          <div className="section-card">
            <div className="section-head">
              <div className="section-head-title">
                <IconFiles /> Generated resumes
                <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginLeft: 8 }}>
                  {resumes.length} total
                </span>
              </div>
              <Link href="/generate" className="section-head-action">New →</Link>
            </div>

            {resumes.map(r => {
              const jd = r.job_descriptions as JobDescription | null
              const dot = statusDot(r.status)
              const downloadUrl = r.docx_url ?? r.pdf_url ?? null

              return (
                <div className="app-row" key={r.id}>
                  <div className={`app-dot ${dot}`} />
                  <div className="app-row-title">{r.title || 'Untitled resume'}</div>
                  <div className="app-row-co">{jd?.company ?? r.positioning_variant ?? ''}</div>
                  <div className="app-row-date">
                    {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <div className={`app-badge ${dot}`}>{statusLabel(r.status)}</div>
                  {downloadUrl && (
                    <a
                      href={downloadUrl}
                      className="generate-btn"
                      download
                      style={{ marginLeft: 8 }}
                    >
                      ↓ DOCX
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
