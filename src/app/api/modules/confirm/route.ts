import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'

// Bulk confirm drafts: { ids } for a chosen set, or { source_document_id } / { source_resume_id }
// for "Confirm all from this upload". Only drafts change; rejected modules stay rejected.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter(isUuid).slice(0, 500) : []
  const documentId = isUuid(body?.source_document_id) ? body.source_document_id as string : null
  const resumeId = isUuid(body?.source_resume_id) ? body.source_resume_id as string : null
  if (ids.length === 0 && !documentId && !resumeId) {
    return NextResponse.json({ error: 'Nothing to confirm.' }, { status: 400 })
  }

  let q = supabase
    .from('modules')
    .update({ status: 'confirmed' })
    .eq('user_id', user.id)
    .eq('status', 'draft')
    .is('deleted_at', null)
  if (ids.length > 0) q = q.in('id', ids)
  if (documentId) q = q.eq('source_document_id', documentId)
  if (resumeId) q = q.eq('source_resume_id', resumeId)
  const { data, error } = await q.select('id')
  if (error) {
    console.error('[modules/confirm]', error)
    return NextResponse.json({ error: 'Could not confirm those modules.' }, { status: 500 })
  }
  return NextResponse.json({ confirmed: (data ?? []).map(r => r.id) })
}
