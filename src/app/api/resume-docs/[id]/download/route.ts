import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { parseResumeDoc } from '@/lib/resume-doc'
import { docToRenderInput, renderResume } from '@/lib/resume-render'

export const maxDuration = 60

type RouteContext = { params: Promise<{ id: string }> }

// GET ?type=pdf|docx — renders the document as last saved, so the file always matches the
// editor. Nothing is stored; files are rendered on demand.
export async function GET(req: Request, { params }: RouteContext) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    const type = new URL(req.url).searchParams.get('type')
    if (type !== 'pdf' && type !== 'docx') return NextResponse.json({ error: 'type must be pdf or docx' }, { status: 400 })

    const { data: row } = await supabase
      .from('resume_documents')
      .select('doc, version, job_description_id, generated_resumes (title)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const parsed = parseResumeDoc(row.doc)
    if (!parsed.ok) return NextResponse.json({ error: 'This resume document is damaged.' }, { status: 422 })

    const rendered = await renderResume(docToRenderInput(parsed.doc))
    const resume = Array.isArray(row.generated_resumes) ? row.generated_resumes[0] : row.generated_resumes
    const base = String(resume?.title || parsed.doc.header.name || 'Resume').replace(/[^\w\s.-]+/g, '').trim() || 'Resume'
    const filename = `${base}.${type}`
    const body = type === 'pdf' ? rendered.pdf : rendered.docx

    // Measurement: share of drafts exported, and edits (saves) per exported resume.
    supabase.from('usage_events').insert({
      user_id: user.id,
      action: 'ev_export',
      metadata: { type, resume_doc_id: id, saves: Math.max(0, (row.version ?? 1) - 1), jd_id: row.job_description_id },
    }).then(({ error }) => { if (error) console.error('[resume-docs download] event log failed:', error) })

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': type === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[resume-docs download]', error)
    return NextResponse.json({ error: 'Could not render this resume.' }, { status: 500 })
  }
}
