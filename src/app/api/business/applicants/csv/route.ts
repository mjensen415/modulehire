import { NextResponse } from 'next/server'
import Papa from 'papaparse'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { checkAndLog } from '@/lib/rate-limit'
import { getOrgRole } from '@/lib/business/org-access'
import { scoreApplicant } from '@/lib/business/score-applicant'

export const maxDuration = 300

const MAX_ROWS = 100

function findColumn(headers: string[], candidates: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase().trim())
  for (const candidate of candidates) {
    const idx = lower.indexOf(candidate)
    if (idx !== -1) return headers[idx]
  }
  return null
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const limit = await checkAndLog(supabase, user.id, 'rl_biz_csv', 5, 3600)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }

    const formData = await req.formData()
    const jobId = formData.get('job_id')
    if (typeof jobId !== 'string' || !isUuid(jobId)) {
      return NextResponse.json({ error: 'Invalid job_id' }, { status: 400 })
    }

    const { data: job, error: jobError } = await supabase
      .from('job_postings')
      .select('id, org_id, title, extracted_company, extracted_themes, extracted_phrases')
      .eq('id', jobId)
      .single()
    if (jobError || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const role = await getOrgRole(supabase, job.org_id, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const csvText = await file.text()
    const parsedCsv = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
    if (parsedCsv.errors.length > 0 && (!parsedCsv.data || parsedCsv.data.length === 0)) {
      return NextResponse.json({ error: 'Could not parse CSV' }, { status: 400 })
    }

    const rows = parsedCsv.data ?? []
    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV has no rows' }, { status: 400 })
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `CSV has too many rows (max ${MAX_ROWS})` }, { status: 400 })
    }

    const headers = parsedCsv.meta.fields ?? []
    const nameCol = findColumn(headers, ['name'])
    const emailCol = findColumn(headers, ['email'])
    const resumeCol = findColumn(headers, ['resume_text', 'resume'])

    if (!resumeCol) {
      return NextResponse.json({ error: 'CSV must have a resume_text or resume column' }, { status: 400 })
    }

    const { data: criteria, error: criteriaError } = await supabase
      .from('scoring_criteria')
      .select('id, label, weight, description')
      .eq('job_id', job.id)
      .order('sort_order', { ascending: true })
    if (criteriaError) throw criteriaError

    const applicantIds: string[] = []
    const errors: Array<{ row: number; reason: string }> = []

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2 // account for header row, 1-indexed
      const row = rows[i]
      const rawText = resumeCol ? row[resumeCol]?.trim() : ''

      if (!rawText) {
        errors.push({ row: rowNum, reason: 'Missing resume_text' })
        continue
      }

      try {
        const { data: applicant, error: insertError } = await supabase
          .from('applicants')
          .insert({
            org_id: job.org_id,
            job_id: job.id,
            name: nameCol ? row[nameCol]?.trim() || null : null,
            email: emailCol ? row[emailCol]?.trim() || null : null,
            raw_text: rawText,
            source: 'csv',
            status: 'new',
          })
          .select('id')
          .single()
        if (insertError) throw insertError

        await scoreApplicant({
          applicantId: applicant.id,
          rawText,
          jobTitle: job.title,
          jobCompany: job.extracted_company ?? null,
          themes: job.extracted_themes ?? [],
          phrases: job.extracted_phrases ?? [],
          criteria: criteria ?? [],
          supabase,
        })

        applicantIds.push(applicant.id)
      } catch (rowError) {
        console.error(`[business/applicants/csv row ${rowNum}]`, rowError)
        errors.push({ row: rowNum, reason: rowError instanceof Error ? rowError.message : 'Unknown error' })
      }
    }

    return NextResponse.json({
      processed: applicantIds.length,
      failed: errors.length,
      applicant_ids: applicantIds,
      errors,
    })
  } catch (error) {
    console.error('[business/applicants/csv POST]', error)
    return NextResponse.json({ error: 'Could not process CSV.' }, { status: 500 })
  }
}
