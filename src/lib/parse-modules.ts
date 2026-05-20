import { aiComplete } from './ai'
import { jsonrepair } from 'jsonrepair'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// Full taxonomy reference (not sent to model — validation handles invalid values):
// role_types: vp-community, head-of-community, director-community, senior-manager-community,
//   community-manager, developer-relations, developer-advocacy, developer-community-manager,
//   community-marketing, community-ops, community-enablement, content-strategy, ic-community
// themes: community-building, community-marketing, community-programs, community-ops,
//   community-health, ambassador-programs, member-lifecycle, retention, engagement,
//   developer-relations, developer-enablement, feedback-loops, ai, technical-content,
//   hackathons, product-collaboration, product-advisory, cross-functional, data-driven,
//   zero-to-one, scale, growth, brand, content-strategy, events, enablement, partnerships,
//   lifecycle-marketing, leadership, executive, consulting, startup

const VALID_TYPES = new Set(['experience', 'skill', 'story', 'positioning'])
const VALID_WEIGHTS = new Set(['anchor', 'strong', 'supporting'])
const VALID_EMP_TYPES = new Set(['full-time', 'consulting', 'contract', 'board', 'volunteer'])

const toArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === 'string' && v.length > 0) return [v]
  return []
}

// Strip parentheticals and split ONLY on commas. Slashes and "and"/"&" are
// preserved because they often appear inside legitimate single-employer names
// ("Microsoft / Yammer", "Smith & Wesson") or dual titles. The model is told
// to never emit a comma-separated list, so this is a safety net only.
function splitCompanyField(raw: unknown): string[] {
  const s = String(raw ?? '').trim()
  if (!s) return []
  const stripped = s.replace(/\s*\([^)]*\)/g, '').trim()
  const parts = stripped
    .split(/\s*,\s*/)
    .map(p => p.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : [stripped]
}

export async function parseModules(
  supabase: SupabaseClient,
  userId: string,
  resumeId: string,
  rawText: string
) {
  const prompt = `You are a resume parsing expert. Decompose the resume below into modular skill blocks.

RULES:
- Create one module per meaningful cluster of related work. Prefer specificity over consolidation — a notable project, achievement, or sub-specialization should be its own module even if it overlaps in topic with another module from the same job.
- A single role will often produce many modules. That is expected and correct. The user curates from abundance — do not filter on their behalf.
- Err on the side of more modules rather than fewer. Do not drop or merge significant achievements, projects, or responsibilities to keep the list short.
- "source_company" MUST NOT be a comma-separated list of companies. If the resume groups multiple
  distinct employers under one date range, emit one module per employer.
  Slash-joined names like "Microsoft / Yammer" are allowed when they describe a single employer
  (e.g. an acquired company under a parent). Acquired-by parentheticals like "(acquired by X)"
  should be stripped — keep only the original employer name.
- "source_role_title" should be exactly the title as written. Slash-joined dual titles are fine.
- DO NOT emit a module for the resume's top-level Summary, Profile, Objective, or About section.
  That content belongs on the user's profile, not in the module library — the caller extracts it
  separately. Skip it entirely.
- Output MUST be a raw JSON array. Start with [ and end with ]. No other text.

Each module object must have exactly these keys:
{
  "type": "experience" | "skill" | "story" | "positioning",
  "title": "skill domain name",
  "content": "paragraph describing the work in this domain",
  "source_company": "company name",
  "source_role_title": "job title",
  "date_start": "YYYY-MM",
  "date_end": "YYYY-MM or present",
  "employment_type": "full-time" | "consulting" | "contract" | "board" | "volunteer",
  "weight": "anchor" | "strong" | "supporting",
  "role_types": ["pick relevant values from the community/devrel/content taxonomy"],
  "themes": ["pick relevant values from the community/growth/leadership taxonomy"],
  "company_stage": ["startup" | "growth" | "enterprise" | "any"]
}

Resume:
${rawText}

JSON array:`

  // 8192 tokens — Haiku 4.5 max output; a dense 3-page resume can exceed 4096
  const rawResponseText = await aiComplete([{ role: 'user', content: prompt }], 8192)

  const stripped = rawResponseText.replace(/```json/g, '').replace(/```/g, '').trim()
  const jsonStart = stripped.indexOf('[')
  const jsonEnd = stripped.lastIndexOf(']')
  if (jsonStart === -1) {
    throw new Error(`Model did not return a JSON array. Response: ${stripped.slice(0, 300)}`)
  }

  // Extract the array — use lastIndexOf(']') if present, else try to repair the truncated JSON
  const rawJson = jsonEnd !== -1
    ? stripped.slice(jsonStart, jsonEnd + 1)
    : stripped.slice(jsonStart)

  // jsonrepair handles: trailing commas, missing quotes, truncated output, unescaped chars
  const repairedJson = jsonrepair(rawJson)
  const rawModulesData: Record<string, unknown>[] = JSON.parse(repairedJson)

  // Safety net: even with a strict prompt, the model occasionally emits
  // "CompanyA, CompanyB" in source_company. Clone the module per company so
  // each row has exactly one source_company and downstream job_experience
  // upserts produce clean rows.
  const modulesData: Record<string, unknown>[] = []
  for (const m of rawModulesData) {
    const companies = splitCompanyField(m.source_company)
    if (companies.length <= 1) {
      modulesData.push({ ...m, source_company: companies[0] ?? null })
    } else {
      for (const c of companies) {
        modulesData.push({ ...m, source_company: c })
      }
    }
  }

  const modulesToInsert = modulesData.map(m => ({
    ...m,
    user_id: userId,
    source_resume_id: resumeId,
    role_types:    toArray(m.role_types),
    themes:        toArray(m.themes),
    company_stage: toArray(m.company_stage),
    type:            VALID_TYPES.has(m.type as string)           ? m.type           : 'experience',
    weight:          VALID_WEIGHTS.has(m.weight as string)       ? m.weight         : 'supporting',
    employment_type: VALID_EMP_TYPES.has(m.employment_type as string) ? m.employment_type : 'full-time',
    title:           m.title   ?? 'Untitled Module',
    content:         m.content ?? '',
  }))

  const { data: insertedModules, error: dbError } = await supabase
    .from('modules')
    .insert(modulesToInsert)
    .select()

  if (dbError) throw dbError

  // Additive: upsert job_experiences and module_job_assignments using admin client (bypasses RLS).
  let jobSyncError: string | undefined
  try {
    const admin = getAdminClient()

    // 1. Collect unique (source_company, source_role_title, date_start, date_end) combinations
    const seen = new Set<string>()
    const uniqueExperiences: {
      company: string
      title: string | null
      start_date: string | null
      end_date: string | null
      employment_type: string
    }[] = []

    for (const m of modulesData) {
      const company    = String(m.source_company    ?? '').trim()
      const roleTitle  = String(m.source_role_title ?? '').trim()
      const dateStart  = String(m.date_start        ?? '').trim()
      const dateEnd    = String(m.date_end           ?? '').trim()
      if (!company) continue
      const key = `${company}||${roleTitle}||${dateStart}`
      if (!seen.has(key)) {
        seen.add(key)
        uniqueExperiences.push({
          company,
          title:            roleTitle || null,
          start_date:       dateStart ? `${dateStart}-01` : null,
          end_date:         dateEnd && dateEnd.toLowerCase() !== 'present' ? `${dateEnd}-01` : null,
          employment_type:  String(m.employment_type ?? 'full-time'),
        })
      }
    }

    if (uniqueExperiences.length > 0) {
      // 2. Insert — skip on conflict so existing rows aren't overwritten
      const { error: jeError } = await admin
        .from('job_experiences')
        .upsert(
          uniqueExperiences.map(e => ({ user_id: userId, ...e })),
          { onConflict: 'user_id,company,title,start_date', ignoreDuplicates: true }
        )
      if (jeError) throw jeError

      // 3. Fetch back rows to get their IDs
      const companies = [...new Set(uniqueExperiences.map(e => e.company))]
      const { data: jobExperiences, error: fetchError } = await admin
        .from('job_experiences')
        .select('id, company, title, start_date')
        .eq('user_id', userId)
        .in('company', companies)
      if (fetchError) throw fetchError

      // 4. Build lookup: "company||title||start_date" → job id
      const jobLookup = new Map<string, string>()
      for (const je of (jobExperiences ?? [])) {
        const k = `${je.company}||${je.title ?? ''}||${je.start_date ?? ''}`
        jobLookup.set(k, je.id)
      }

      // 5. Map each inserted module to its job and collect assignments
      const assignments: { module_id: string; job_id: string }[] = []
      for (const mod of (insertedModules ?? []) as Record<string, unknown>[]) {
        const company   = String(mod.source_company    ?? '').trim()
        const roleTitle = String(mod.source_role_title ?? '').trim()
        const dateStart = mod.date_start ? `${String(mod.date_start).trim()}-01` : ''
        const k = `${company}||${roleTitle}||${dateStart}`
        const jobId = jobLookup.get(k)
        if (jobId) assignments.push({ module_id: String(mod.id), job_id: jobId })
      }

      if (assignments.length > 0) {
        const { error: assignError } = await admin
          .from('module_job_assignments')
          .upsert(assignments, { onConflict: 'module_id,job_id', ignoreDuplicates: true })
        if (assignError) throw assignError
      }
    }
  } catch (err) {
    console.error('[parseModules] job_experience/assignment upsert failed:', err)
    jobSyncError = (err as Error).message
  }

  // Extract contact info + summary + education from the resume (small fast call)
  type EducationEntry = { school: string; degree: string; field: string; year: string }
  let contact: {
    full_name: string | null
    email: string | null
    phone: string | null
    linkedin_url: string | null
    location: string | null
    summary: string | null
    education: EducationEntry[]
  } = { full_name: null, email: null, phone: null, linkedin_url: null, location: null, summary: null, education: [] }

  try {
    const contactPrompt = `Extract contact information, the candidate's summary section, and the education section from this resume.
Return JSON only:
{
  "full_name": "...",
  "email": "...",
  "phone": "...",
  "linkedin_url": "...",
  "location": "...",
  "summary": "...",
  "education": [
    { "school": "...", "degree": "...", "field": "...", "year": "..." }
  ]
}
For "summary": include the verbatim Summary / Profile / Objective / About paragraph(s) at the top of the resume if present (typically 2-4 sentences). If there is no such section, return null. Do NOT fabricate a summary.
For "education":
  - Return an array (empty array [] if no education section).
  - "school" is the institution name (e.g. "Stanford University").
  - "degree" is the degree name (e.g. "B.A.", "MBA", "Ph.D."). Empty string if none stated.
  - "field" is the major / area of study (e.g. "Computer Science"). Empty string if none stated.
  - "year" is the graduation year or year range as written (e.g. "2018", "2014-2018"). Empty string if none stated.
  - Do NOT fabricate entries. Only include entries actually present in the resume.
Use null for any other field not found.

Resume:
${rawText.slice(0, 4000)}

JSON:`

    const contactRaw = await aiComplete([{ role: 'user', content: contactPrompt }], 1000)
    const stripped = contactRaw.replace(/```json/g, '').replace(/```/g, '').trim()
    const jsonStart = stripped.indexOf('{')
    const jsonEnd = stripped.lastIndexOf('}')
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const parsed = JSON.parse(jsonrepair(stripped.slice(jsonStart, jsonEnd + 1)))
      const educationRaw = Array.isArray(parsed.education) ? parsed.education : []
      const education: EducationEntry[] = educationRaw
        .map((e: unknown): EducationEntry | null => {
          if (!e || typeof e !== 'object') return null
          const r = e as Record<string, unknown>
          const school = typeof r.school === 'string' ? r.school.trim() : ''
          const degree = typeof r.degree === 'string' ? r.degree.trim() : ''
          const field  = typeof r.field  === 'string' ? r.field.trim()  : ''
          const year   = typeof r.year   === 'string' ? r.year.trim()   : ''
          if (!school && !degree && !field && !year) return null
          return { school, degree, field, year }
        })
        .filter((e: EducationEntry | null): e is EducationEntry => e !== null)
        .slice(0, 20)

      contact = {
        full_name: parsed.full_name ?? null,
        email: parsed.email ?? null,
        phone: parsed.phone ?? null,
        linkedin_url: parsed.linkedin_url ?? null,
        location: parsed.location ?? null,
        summary: typeof parsed.summary === 'string' && parsed.summary.trim().length > 0
          ? parsed.summary.trim()
          : null,
        education,
      }
    }
  } catch {
    // Contact extraction is best-effort — don't fail the whole parse
  }

  return { modules: insertedModules, contact, jobSyncError }
}
