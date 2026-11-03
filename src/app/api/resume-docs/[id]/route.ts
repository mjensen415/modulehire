import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { saveResumeDoc } from '@/lib/resume-doc-save'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { data, error } = await supabase
      .from('resume_documents')
      .select('id, doc, version, job_description_id, generated_resume_id, fit_report, updated_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(data)
  } catch (error) {
    console.error('[resume-docs GET]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}

// PATCH { doc, version } — saves the whole document (saveResumeDoc). A stale `version` (someone
// saved since, in another tab or from an AI client) returns 409 so the client reloads instead
// of silently overwriting.
export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const body = await req.json()
    const version = Number(body?.version)
    if (!Number.isInteger(version) || version < 1) return NextResponse.json({ error: 'Invalid version' }, { status: 400 })

    const saved = await saveResumeDoc(supabase, user.id, id, version, body?.doc)
    if (!saved.ok) {
      if (saved.reason === 'invalid') return NextResponse.json({ error: `Invalid document: ${saved.error}` }, { status: 400 })
      if (saved.reason === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ error: 'This resume was changed somewhere else.', current_version: saved.current_version }, { status: 409 })
    }

    return NextResponse.json({ version: saved.version, updated_at: saved.updated_at })
  } catch (error) {
    console.error('[resume-docs PATCH]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
