import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getActiveProfileId } from '@/lib/profile'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid } from '@/lib/validate'
import { isImportKind } from '@/lib/documents'
import { parseAccomplishments } from '@/lib/parse-document'

export const maxDuration = 120

const ym = (d: string | null) => (d ? String(d).slice(0, 7) : null)

// Step 2 of a document import: the user has confirmed which role the document is from. Extract
// accomplishments (Haiku) and insert them as drafts attached to that job, so they land in the
// library's review queue. Nothing is usable until the user confirms it.
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    if (!isUuid(body?.document_id) || !isUuid(body?.job_experience_id)) {
      return NextResponse.json({ error: 'Choose which role this document is from.' }, { status: 400 })
    }
    const [{ data: doc }, { data: job }] = await Promise.all([
      supabase.from('documents').select('id, kind, raw_text, filename, period_label').eq('id', body.document_id).eq('user_id', user.id).is('deleted_at', null).maybeSingle(),
      supabase.from('job_experiences').select('id, company, title, start_date, end_date').eq('id', body.job_experience_id).eq('user_id', user.id).maybeSingle(),
    ])
    if (!doc || !isImportKind(doc.kind)) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    if (!job) return NextResponse.json({ error: 'That role is not in your work history.' }, { status: 404 })
    if (!doc.raw_text) return NextResponse.json({ error: 'This document has no readable text.' }, { status: 400 })

    const limit = await checkAndLog(supabase, user.id, 'rl_parse_document', 20, 3600)
    if (!limit.ok) return NextResponse.json({ error: 'Too many imports in the last hour. Try again later.' }, { status: 429 })

    const admin = await createAdminClient()
    const periodLabel = typeof body?.period_label === 'string' && body.period_label.trim()
      ? body.period_label.trim().slice(0, 80)
      : doc.period_label
    await admin.from('documents').update({ job_experience_id: job.id, period_label: periodLabel }).eq('id', doc.id).eq('user_id', user.id)

    const parsed = await parseAccomplishments(doc.raw_text, doc.kind, { company: job.company, title: job.title }, user.id)
    if (parsed.length === 0) {
      return NextResponse.json({ modules: [], message: "We didn't find concrete accomplishments in this document. Ratings and goals aren't turned into modules." })
    }

    const profileId = await getActiveProfileId(supabase, user.id)
    const rows = parsed.map(m => ({
      user_id: user.id,
      profile_id: profileId,
      status: 'draft',
      source_document_id: doc.id,
      source_quote: m.source_quote,
      type: m.type,
      title: m.title,
      content: m.content,
      weight: m.weight,
      dimensions: m.dimensions,
      source_company: job.company,
      source_role_title: job.title,
      date_start: ym(job.start_date),
      date_end: ym(job.end_date),
    }))
    const { data: inserted, error } = await supabase.from('modules').insert(rows).select('id, title')
    if (error) throw error
    // Assignments go through the admin client, as in parseModules.
    const { error: assignError } = await admin
      .from('module_job_assignments')
      .upsert((inserted ?? []).map(m => ({ module_id: m.id, job_id: job.id })), { onConflict: 'module_id,job_id', ignoreDuplicates: true })
    if (assignError) console.error('[parse-document] assignments', assignError)

    return NextResponse.json({ modules: inserted ?? [], document_id: doc.id, job_id: job.id })
  } catch (error) {
    console.error('[parse-document]', error)
    return NextResponse.json({ error: 'We could not read that document. Try again.' }, { status: 500 })
  }
}
