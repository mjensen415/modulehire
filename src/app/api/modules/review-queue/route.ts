import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveProfileId } from '@/lib/profile'

export type ReviewDraft = {
  id: string
  title: string
  content: string
  source_quote: string | null
  source_company: string | null
  source_role_title: string | null
  dimensions: string[] | null
  created_at: string
  /** Groups drafts for "Confirm all from this upload". */
  source: { kind: 'document' | 'resume' | 'none'; id: string | null; label: string }
}

// Draft modules waiting for the user: the Library's "To review" queue (and the home panel).
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limitParam = Number(new URL(req.url).searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 500
  const profileId = await getActiveProfileId(supabase, user.id)

  const { data, error, count } = await supabase
    .from('modules')
    .select('id, title, content, source_quote, source_company, source_role_title, dimensions, created_at, source_resume_id, source_document_id', { count: 'exact' })
    .eq('user_id', user.id)
    .eq('profile_id', profileId)
    .eq('status', 'draft')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('[review-queue]', error)
    return NextResponse.json({ error: 'Could not load modules to review.' }, { status: 500 })
  }
  const rows = data ?? []

  // Filenames for the "From: …" line. documents may not exist yet on an older database.
  const docIds = [...new Set(rows.map(r => r.source_document_id).filter(Boolean))] as string[]
  const resumeIds = [...new Set(rows.map(r => r.source_resume_id).filter(Boolean))] as string[]
  const [docs, resumes] = await Promise.all([
    docIds.length
      ? supabase.from('documents').select('id, filename, period_label').in('id', docIds)
      : Promise.resolve({ data: [] as Array<{ id: string; filename: string | null; period_label: string | null }> }),
    resumeIds.length
      ? supabase.from('resumes').select('id, filename').in('id', resumeIds)
      : Promise.resolve({ data: [] as Array<{ id: string; filename: string | null }> }),
  ])
  const docName = new Map((docs.data ?? []).map(d => [d.id, d.filename || d.period_label || 'Uploaded document']))
  const resumeName = new Map((resumes.data ?? []).map(r => [r.id, r.filename || 'Your resume']))

  const drafts: ReviewDraft[] = rows.map(r => ({
    id: r.id,
    title: r.title,
    content: r.content,
    source_quote: r.source_quote,
    source_company: r.source_company,
    source_role_title: r.source_role_title,
    dimensions: r.dimensions,
    created_at: r.created_at,
    source: r.source_document_id && docName.has(r.source_document_id)
      ? { kind: 'document', id: r.source_document_id, label: docName.get(r.source_document_id)! }
      : r.source_resume_id
        ? { kind: 'resume', id: r.source_resume_id, label: resumeName.get(r.source_resume_id) ?? 'Your resume' }
        : { kind: 'none', id: null, label: 'Your library' },
  }))
  return NextResponse.json({ drafts, total: count ?? drafts.length })
}
