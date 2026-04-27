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

export async function parseModules(
  supabase: SupabaseClient,
  userId: string,
  resumeId: string,
  rawText: string
) {
  const prompt = `You are a resume parsing expert. Decompose the resume below into modular skill blocks.

RULES:
- Create one module per skill domain per job (NOT one module per job)
- A 4-year role should produce multiple modules: each major domain separately
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
  const modulesData: Record<string, unknown>[] = JSON.parse(repairedJson)

  const modulesToInsert = modulesData.map(m => ({
    user_id: userId,
    source_resume_id: resumeId,
    ...m,
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
  }

  // Extract contact info from the top of the resume (small, fast second call)
  let contact: {
    full_name: string | null
    email: string | null
    phone: string | null
    linkedin_url: string | null
    location: string | null
  } = { full_name: null, email: null, phone: null, linkedin_url: null, location: null }

  try {
    const contactPrompt = `Extract contact information from this resume.
Return JSON only:
{
  "full_name": "...",
  "email": "...",
  "phone": "...",
  "linkedin_url": "...",
  "location": "..."
}
Use null for any field not found.

Resume:
${rawText.slice(0, 2000)}

JSON:`

    const contactRaw = await aiComplete([{ role: 'user', content: contactPrompt }], 256)
    const stripped = contactRaw.replace(/```json/g, '').replace(/```/g, '').trim()
    const jsonStart = stripped.indexOf('{')
    const jsonEnd = stripped.lastIndexOf('}')
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const parsed = JSON.parse(jsonrepair(stripped.slice(jsonStart, jsonEnd + 1)))
      contact = {
        full_name: parsed.full_name ?? null,
        email: parsed.email ?? null,
        phone: parsed.phone ?? null,
        linkedin_url: parsed.linkedin_url ?? null,
        location: parsed.location ?? null,
      }
    }
  } catch {
    // Contact extraction is best-effort — don't fail the whole parse
  }

  return { modules: insertedModules, contact }
}
