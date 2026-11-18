import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'

// GET ?type=document|generated&id= → the file. Uploaded files come from storage through a
// short-lived signed URL; a pasted interview email (no file) downloads as text.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const type = url.searchParams.get('type')
  const id = url.searchParams.get('id')
  if (!isUuid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const admin = await createAdminClient()

  if (type === 'generated') {
    const { data: doc } = await supabase.from('resume_documents').select('id').eq('generated_resume_id', id).eq('user_id', user.id).maybeSingle()
    if (doc) return NextResponse.redirect(new URL(`/api/resume-docs/${doc.id}/download?type=pdf`, url))
    const { data: g } = await supabase.from('generated_resumes').select('pdf_url, docx_url').eq('id', id).eq('user_id', user.id).is('deleted_at', null).maybeSingle()
    const path = g?.pdf_url || g?.docx_url
    if (!path) return NextResponse.json({ error: 'This resume has no file to download.' }, { status: 404 })
    const { data: signed } = await admin.storage.from('temp').createSignedUrl(path, 300)
    return signed ? NextResponse.redirect(signed.signedUrl) : NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: d } = await supabase.from('documents').select('kind, filename, file_url, raw_text').eq('id', id).eq('user_id', user.id).is('deleted_at', null).maybeSingle()
  if (!d) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (d.file_url) {
    // Resumes keep their file in the resumes bucket; every other upload is in documents.
    const bucket = d.kind === 'resume' ? 'resumes' : 'documents'
    const { data: signed } = await admin.storage.from(bucket).createSignedUrl(d.file_url, 300, { download: d.filename ?? true })
    if (signed) return NextResponse.redirect(signed.signedUrl)
  }
  if (d.raw_text) {
    const name = (d.filename || 'document').replace(/[^\w .()-]+/g, '_').replace(/\.(pdf|docx)$/i, '')
    return new NextResponse(d.raw_text, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.txt"` },
    })
  }
  return NextResponse.json({ error: 'This file is no longer stored.' }, { status: 404 })
}
