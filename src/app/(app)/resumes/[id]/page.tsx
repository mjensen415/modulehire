import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ScoreGauge from '@/components/ScoreGauge'

export default async function ResumeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const { data: resume, error } = await supabase
    .from('generated_resumes')
    .select(`
      id, title, positioning_variant, created_at, docx_url, pdf_url, module_ids_used,
      job_description_id, ats_score,
      job_descriptions (id, extracted_job_title, extracted_role_type, extracted_company, source_url, match_report)
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (error || !resume) notFound()

  const jd = Array.isArray(resume.job_descriptions) ? resume.job_descriptions[0] : resume.job_descriptions
  const jdTitle = jd?.extracted_job_title || jd?.extracted_role_type || null
  const hasReport = !!jd?.match_report

  const bucket = 'temp'
  const [pdfSigned, docxSigned] = await Promise.all([
    resume.pdf_url ? supabase.storage.from(bucket).createSignedUrl(resume.pdf_url, 3600) : Promise.resolve({ data: null }),
    resume.docx_url ? supabase.storage.from(bucket).createSignedUrl(resume.docx_url, 3600) : Promise.resolve({ data: null }),
  ])
  const pdfUrl = pdfSigned.data?.signedUrl ?? null
  const docxUrl = docxSigned.data?.signedUrl ?? null
  const filesMissing = !resume.pdf_url && !resume.docx_url

  const moduleIds: string[] = Array.isArray(resume.module_ids_used) ? resume.module_ids_used : []
  const { data: modulesUsed } = moduleIds.length > 0
    ? await supabase.from('modules').select('id, title').in('id', moduleIds)
    : { data: [] as Array<{ id: string; title: string }> }

  const createdDate = new Date(resume.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <>
      <div className="app-topbar">
        <div>
          <Link href="/resumes" style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none' }}>← All resumes</Link>
          <span className="topbar-title" style={{ display: 'block', marginTop: 4 }}>{resume.title || 'Untitled resume'}</span>
          <span className="topbar-sub">
            {jd?.extracted_company ?? ''}{jd?.extracted_company && jdTitle ? ' · ' : ''}{jdTitle ?? ''}{!jd?.extracted_company && !jdTitle ? `Created ${createdDate}` : ''}
          </span>
        </div>
      </div>

      <div className="dash-content">
        <div style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Created {createdDate}</div>
            {typeof resume.ats_score === 'number' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ScoreGauge score={resume.ats_score} size="sm" showLabel={false} />
                <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>ATS estimate: {resume.ats_score}</span>
              </div>
            )}
          </div>

          {filesMissing ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '32px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>This file is no longer available</div>
              <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>The stored file has expired or was removed.</div>
              {resume.job_description_id && (
                <Link href={`/generate?jd_id=${resume.job_description_id}`} className="btn-primary" style={{ display: 'inline-flex' }}>Regenerate</Link>
              )}
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' }}>
              {pdfUrl ? (
                <iframe src={pdfUrl} style={{ width: '100%', height: '80vh', border: 'none', display: 'block' }} title="Resume preview" />
              ) : (
                <div style={{ padding: '32px 24px', textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
                  No inline preview available for this file. Use the download buttons below.
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {pdfUrl && <a className="btn-primary" href={pdfUrl} download>Download PDF</a>}
            {docxUrl && <a className="btn-ghost" href={docxUrl} download>Download Word</a>}
            {hasReport && jd && <Link className="btn-ghost" href={`/matches/${jd.id}`}>Open match report</Link>}
            {resume.job_description_id && <Link className="btn-ghost" href={`/generate?jd_id=${resume.job_description_id}`}>Make another version</Link>}
          </div>

          {!pdfUrl && !docxUrl && resume.job_description_id && !filesMissing && (
            <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>
              This file is no longer available. <Link href={`/generate?jd_id=${resume.job_description_id}`} style={{ color: 'var(--teal)' }}>Regenerate →</Link>
            </div>
          )}

          {modulesUsed && modulesUsed.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
                Modules used
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {modulesUsed.map(m => (
                  <Link
                    key={m.id}
                    href={`/library/${m.id}`}
                    style={{ fontSize: 12.5, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text2)', textDecoration: 'none' }}
                  >
                    {m.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
