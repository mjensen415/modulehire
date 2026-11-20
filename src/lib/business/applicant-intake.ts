// One path for adding a scored applicant to a posting, shared by single upload, the file-export
// import wizard and the Greenhouse connector: extract text, skip duplicates, insert, store the
// file, score. Plan and rate limits are checked by the calling route before this runs.
import type { SupabaseClient } from '@supabase/supabase-js'
import { scoreApplicant } from './score-applicant'

export const EXTERNAL_SOURCES = ['greenhouse', 'lever', 'ashby', 'workable', 'adp', 'other'] as const
export type ExternalSource = (typeof EXTERNAL_SOURCES)[number]
export const isExternalSource = (v: unknown): v is ExternalSource =>
  typeof v === 'string' && (EXTERNAL_SOURCES as readonly string[]).includes(v)

export const MAX_RESUME_BYTES = 10 * 1024 * 1024

export function nameFromFilename(filename: string): string | null {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim()
  if (!base) return null
  return base.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

export function nameFromText(text: string): string | null {
  // The first non-empty line of a resume is nearly always the candidate's name.
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 2)
  if (!firstLine) return null
  const cleaned = firstLine.replace(/[,|•◆♦@/\\()[\]]/g, ' ').trim()
  const words = cleaned.split(/\s+/).slice(0, 2)
  if (words.length < 2) return null
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

export function resumeKind(filename: string, contentType = ''): 'pdf' | 'docx' | 'txt' | null {
  const n = filename.toLowerCase()
  if (contentType === 'application/pdf' || n.endsWith('.pdf')) return 'pdf'
  if (n.endsWith('.docx') || contentType.includes('wordprocessingml')) return 'docx'
  if (contentType.startsWith('text/plain') || n.endsWith('.txt')) return 'txt'
  return null
}

export async function extractResumeText(buffer: Buffer, filename: string, contentType = ''): Promise<string> {
  const kind = resumeKind(filename, contentType)
  if (kind === 'pdf') {
    const { getDocumentProxy, extractText } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: true })
    return text
  }
  if (kind === 'txt') return buffer.toString('utf-8')
  if (kind === 'docx') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  throw new Error('Unsupported resume file. Use PDF, Word (.docx) or plain text.')
}

export type IntakeJob = {
  id: string
  org_id: string
  title: string
  extracted_company: string | null
  extracted_themes: string[] | null
  extracted_phrases: string[] | null
  degree_requirement: unknown
}

export const INTAKE_JOB_COLUMNS = 'id, org_id, title, extracted_company, extracted_themes, extracted_phrases, degree_requirement'

export type IntakeInput = {
  supabase: SupabaseClient // the caller's client: RLS-checked insert and scoring writes
  admin: SupabaseClient // service role: duplicate lookup, external ids, file_url
  userId: string
  job: IntakeJob
  criteria: Array<{ id: string; label: string; weight: string; description: string | null; criterion_type?: string; min_years?: number | null }>
  rawText: string
  name?: string | null
  email?: string | null
  source: 'upload' | 'csv' | 'import' | 'greenhouse'
  externalSource?: ExternalSource | null
  externalId?: string | null
  atsStage?: string | null
  file?: { buffer: Buffer; filename: string; contentType: string } | null
}

export type IntakeResult =
  | { status: 'created'; applicantId: string; name: string | null; overallScore: number | null; hasDealbreaker: boolean }
  | { status: 'duplicate'; applicantId: string }

const clip = (v: string | null | undefined, n: number) => {
  const s = (v ?? '').trim()
  return s ? s.slice(0, n) : null
}

/** An applicant already on this posting with the same ATS id, or else the same email. */
export async function findDuplicate(
  admin: SupabaseClient,
  jobId: string,
  externalSource: string | null | undefined,
  externalId: string | null | undefined,
  email: string | null | undefined,
): Promise<string | null> {
  if (externalSource && externalId) {
    const { data } = await admin
      .from('applicants')
      .select('id')
      .eq('job_id', jobId)
      .eq('external_source', externalSource)
      .eq('external_id', externalId)
      .maybeSingle()
    if (data) return data.id as string
  }
  const e = clip(email, 200)?.toLowerCase()
  if (e) {
    // Case-insensitive exact match: escape ilike's wildcards ("_" is common in emails).
    const { data } = await admin.from('applicants').select('id').eq('job_id', jobId).ilike('email', e.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(1)
    if (data?.length) return data[0].id as string
  }
  return null
}

export async function intakeApplicant(input: IntakeInput): Promise<IntakeResult> {
  const { supabase, admin, job } = input
  const rawText = input.rawText.trim()
  if (!rawText) throw new Error('Could not extract text from resume')

  const dup = await findDuplicate(admin, job.id, input.externalSource, input.externalId, input.email)
  if (dup) return { status: 'duplicate', applicantId: dup }

  const name = clip(input.name, 200) ?? nameFromText(rawText) ?? (input.file ? nameFromFilename(input.file.filename) : null)

  const { data: applicant, error: insertError } = await supabase
    .from('applicants')
    .insert({
      org_id: job.org_id,
      job_id: job.id,
      name,
      email: clip(input.email, 200),
      raw_text: rawText.slice(0, 200_000),
      source: input.source,
      status: 'new',
    })
    .select('id')
    .single()
  if (insertError) throw insertError
  const applicantId = applicant.id as string

  // Service role: users can't set these columns, so an import can't be spoofed or re-pointed.
  const extra: Record<string, unknown> = {}
  if (input.externalSource) extra.external_source = input.externalSource
  if (input.externalSource && input.externalId) extra.external_id = clip(input.externalId, 200)
  if (input.atsStage) extra.ats_stage = clip(input.atsStage, 120)
  if (input.file) {
    const ext = (input.file.filename.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'pdf'
    const storagePath = `${job.org_id}/${job.id}/${applicantId}.${ext}`
    const { error: storageError } = await admin.storage
      .from('applicant-resumes')
      .upload(storagePath, input.file.buffer, { contentType: input.file.contentType || 'application/octet-stream', upsert: true })
    // A storage failure isn't fatal: the applicant still has their text and score.
    if (!storageError) extra.file_url = storagePath
  }
  if (Object.keys(extra).length) {
    const { error } = await admin.from('applicants').update(extra).eq('id', applicantId)
    if (error) {
      // A unique-index race (two imports of the same ATS id at once): drop this copy.
      if ((error as { code?: string }).code === '23505') {
        await admin.from('applicants').delete().eq('id', applicantId)
        const existing = await findDuplicate(admin, job.id, input.externalSource, input.externalId, null)
        return { status: 'duplicate', applicantId: existing ?? applicantId }
      }
      console.error('[applicant-intake] extra columns', error)
    }
  }

  await scoreApplicant({
    applicantId,
    applicantName: name,
    rawText,
    jobTitle: job.title,
    jobCompany: job.extracted_company ?? null,
    themes: job.extracted_themes ?? [],
    phrases: job.extracted_phrases ?? [],
    degreeRequirement: (job.degree_requirement ?? null) as Parameters<typeof scoreApplicant>[0]['degreeRequirement'],
    criteria: input.criteria,
    supabase,
    userId: input.userId,
  })

  const { data: scored } = await admin.from('applicants').select('name, overall_score, has_dealbreaker').eq('id', applicantId).single()
  return {
    status: 'created',
    applicantId,
    name: (scored?.name as string | null) ?? name,
    overallScore: (scored?.overall_score as number | null) ?? null,
    hasDealbreaker: !!scored?.has_dealbreaker,
  }
}

export async function loadCriteria(supabase: SupabaseClient, jobId: string) {
  const { data, error } = await supabase
    .from('scoring_criteria')
    .select('id, label, weight, description, criterion_type, min_years')
    .eq('job_id', jobId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}
