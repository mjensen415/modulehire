import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { parseResumeDoc } from '@/lib/resume-doc'

type RouteContext = { params: Promise<{ id: string }> }

const HISTORY_KEEP = 50

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

// PATCH { doc, version } — saves the whole document. `version` is the version the client
// edited; if someone saved since (another tab), the update matches no row and this returns
// 409 so the client reloads instead of silently overwriting.
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
    const parsed = parseResumeDoc(body?.doc)
    if (!parsed.ok) return NextResponse.json({ error: `Invalid document: ${parsed.error}` }, { status: 400 })

    const nextVersion = version + 1
    const { data: updated, error } = await supabase
      .from('resume_documents')
      .update({ doc: parsed.doc, version: nextVersion, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('version', version)
      .select('id, version, updated_at')
      .maybeSingle()
    if (error) throw error
    if (!updated) {
      const { data: current } = await supabase
        .from('resume_documents')
        .select('version')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ error: 'This resume was changed somewhere else.', current_version: current.version }, { status: 409 })
    }

    // History is a convenience, not the save itself — log failures, don't fail the request.
    const { error: historyError } = await supabase
      .from('resume_document_history')
      .insert({ document_id: id, version: nextVersion, doc: parsed.doc })
    if (historyError) console.error('[resume-docs PATCH] history insert failed:', historyError)
    else {
      await supabase
        .from('resume_document_history')
        .delete()
        .eq('document_id', id)
        .lte('version', nextVersion - HISTORY_KEEP)
    }

    return NextResponse.json({ version: updated.version, updated_at: updated.updated_at })
  } catch (error) {
    console.error('[resume-docs PATCH]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
