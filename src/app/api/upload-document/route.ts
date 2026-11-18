import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { allows, entitlements, LIMIT_MESSAGES } from '@/lib/entitlements'
import { extractResumeText, isUnreadable, UNREADABLE_TEXT_MESSAGE } from '@/lib/resume-text'
import { guessPeriod, isImportKind, jobForYear } from '@/lib/documents'

export const maxDuration = 60

const MAX_SIZE = 10 * 1024 * 1024 // same limits as resume upload

// Step 1 of importing a performance review / brag doc / other document: store the file and its
// text, guess the review period and the job it belongs to. Nothing is parsed until the user
// confirms the job (POST /api/parse-document).
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file') as File | null
    const kind = form.get('kind')
    if (!isImportKind(kind)) return NextResponse.json({ error: 'Choose what kind of document this is.' }, { status: 400 })
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    const name = file.name.toLowerCase()
    if (!(name.endsWith('.pdf') || name.endsWith('.docx') || name.endsWith('.txt') || file.type === 'application/pdf')) {
      return NextResponse.json({ error: 'Only PDF, DOCX and TXT files are supported' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 })

    const ent = await entitlements(supabase, user.id)
    if (!allows(ent.documents)) {
      return ent.active
        ? NextResponse.json({ error: LIMIT_MESSAGES.fairUse, code: 'DOCUMENT_FAIR_USE' }, { status: 429 })
        : NextResponse.json({ error: LIMIT_MESSAGES.documents, code: 'DOCUMENT_LIMIT_REACHED', limit: ent.documents.limit }, { status: 403 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const rawText = await extractResumeText(buffer, file.name, file.type)
    if (isUnreadable(rawText)) {
      return NextResponse.json({ error: UNREADABLE_TEXT_MESSAGE, code: 'unreadable_file' }, { status: 400 })
    }

    const admin = await createAdminClient()
    const storagePath = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: storageError } = await admin.storage.from('documents').upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream', upsert: false,
    })
    if (storageError) console.error('[upload-document] storage', storageError)

    const { data: jobs } = await supabase
      .from('job_experiences')
      .select('id, company, title, start_date, end_date')
      .eq('user_id', user.id)
      .order('start_date', { ascending: false, nullsFirst: false })
    const period = guessPeriod(file.name, rawText)
    const suggestedJobId = jobForYear(jobs ?? [], period.year)

    const { data: doc, error } = await admin
      .from('documents')
      .insert({
        user_id: user.id,
        kind,
        filename: file.name,
        file_url: storageError ? null : storagePath,
        raw_text: rawText,
        period_label: kind === 'performance_review' ? period.label : null,
      })
      .select('id, kind, filename, period_label')
      .single()
    if (error) throw error

    return NextResponse.json({
      document: doc,
      suggested_job_id: suggestedJobId,
      jobs: jobs ?? [],
    })
  } catch (error) {
    console.error('[upload-document]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
