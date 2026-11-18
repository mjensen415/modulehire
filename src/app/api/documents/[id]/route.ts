import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'

type Ctx = { params: Promise<{ id: string }> }

// Delete a source document: its stored file and text are removed. The row stays (soft-deleted, so
// it still counts toward the Free document limit). Modules made from it are kept unless the user
// says otherwise ({ keep_modules: false }), in which case they're soft-deleted too.
export async function DELETE(req: Request, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  const keepModules = body?.keep_modules !== false

  const { data: doc } = await supabase.from('documents').select('id, kind, file_url, source_resume_id').eq('id', id).eq('user_id', user.id).is('deleted_at', null).maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const admin = await createAdminClient()
  const now = new Date().toISOString()
  if (doc.file_url) {
    const { error: rmError } = await admin.storage.from(doc.kind === 'resume' ? 'resumes' : 'documents').remove([doc.file_url])
    if (rmError) console.error('[documents DELETE] storage', rmError)
  }
  const { error } = await admin.from('documents').update({ deleted_at: now, file_url: null, raw_text: null }).eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Could not delete it.' }, { status: 500 })
  if (doc.kind === 'resume' && doc.source_resume_id) {
    await admin.from('resumes').update({ deleted_at: now, file_url: null }).eq('id', doc.source_resume_id).eq('user_id', user.id)
  }

  let removed = 0
  if (!keepModules) {
    const filters = [`source_document_id.eq.${id}`]
    if (doc.kind === 'resume' && doc.source_resume_id) filters.push(`source_resume_id.eq.${doc.source_resume_id}`)
    const { data } = await admin
      .from('modules')
      .update({ deleted_at: now })
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .or(filters.join(','))
      .select('id')
    removed = data?.length ?? 0
  }
  return NextResponse.json({ ok: true, modules_removed: removed })
}
