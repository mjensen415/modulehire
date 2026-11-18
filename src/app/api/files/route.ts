import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { KIND_LABELS, type DocumentKind } from '@/lib/documents'

export type FileItem = {
  id: string
  type: 'document' | 'generated'
  kind: DocumentKind
  kind_label: string
  name: string
  created_at: string
  job: string | null
  /** Modules created from it (documents only), for the delete question. */
  module_count: number
  href: string | null
}

// Every document the user uploaded or pasted, plus their tailored resumes, newest first.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [docs, gens, jobs, ivs, mods] = await Promise.all([
    supabase.from('documents').select('id, kind, filename, period_label, job_experience_id, source_resume_id, created_at').eq('user_id', user.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(500),
    supabase.from('generated_resumes').select('id, title, created_at, job_descriptions(extracted_job_title, extracted_company)').eq('user_id', user.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(500),
    supabase.from('job_experiences').select('id, company, title').eq('user_id', user.id),
    supabase.from('interviews').select('source_document_id, round_name, job_applications(company, title)').eq('user_id', user.id).not('source_document_id', 'is', null),
    supabase.from('modules').select('source_document_id, source_resume_id').eq('user_id', user.id).is('deleted_at', null).limit(5000),
  ])
  if (docs.error || gens.error) {
    console.error('[files GET]', docs.error ?? gens.error)
    return NextResponse.json({ error: 'Could not load your files.' }, { status: 500 })
  }

  const jobLabel = new Map((jobs.data ?? []).map(j => [j.id, `${j.title ? `${j.title} · ` : ''}${j.company}`]))
  const ivLabel = new Map<string, string>()
  for (const iv of ivs.data ?? []) {
    const app = (Array.isArray(iv.job_applications) ? iv.job_applications[0] : iv.job_applications) as { company: string; title: string } | null
    if (iv.source_document_id && app) ivLabel.set(iv.source_document_id, `${app.title ? `${app.title} · ` : ''}${app.company}`)
  }
  const byDoc = new Map<string, number>()
  const byResume = new Map<string, number>()
  for (const m of mods.data ?? []) {
    if (m.source_document_id) byDoc.set(m.source_document_id, (byDoc.get(m.source_document_id) ?? 0) + 1)
    else if (m.source_resume_id) byResume.set(m.source_resume_id, (byResume.get(m.source_resume_id) ?? 0) + 1)
  }

  const items: FileItem[] = [
    ...(docs.data ?? []).map(d => ({
      id: d.id,
      type: 'document' as const,
      kind: d.kind as DocumentKind,
      kind_label: KIND_LABELS[d.kind as DocumentKind] ?? 'Other',
      name: d.filename || d.period_label || KIND_LABELS[d.kind as DocumentKind] || 'Document',
      created_at: d.created_at,
      job: (d.job_experience_id && jobLabel.get(d.job_experience_id)) || ivLabel.get(d.id) || null,
      // Older resume modules point at the resume, not the document.
      module_count: (byDoc.get(d.id) ?? 0) + (d.kind === 'resume' && d.source_resume_id ? byResume.get(d.source_resume_id) ?? 0 : 0),
      href: d.kind === 'interview_email' ? '/interviews' : null,
    })),
    ...(gens.data ?? []).map(g => {
      const jd = (Array.isArray(g.job_descriptions) ? g.job_descriptions[0] : g.job_descriptions) as { extracted_job_title: string | null; extracted_company: string | null } | null
      return {
        id: g.id,
        type: 'generated' as const,
        kind: 'generated_resume' as const,
        kind_label: KIND_LABELS.generated_resume,
        name: g.title || 'Tailored resume',
        created_at: g.created_at,
        job: jd ? [jd.extracted_job_title || 'Untitled role', jd.extracted_company].filter(Boolean).join(' · ') : null,
        module_count: 0,
        href: `/resumes/${g.id}`,
      }
    }),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at))

  return NextResponse.json({ files: items })
}
