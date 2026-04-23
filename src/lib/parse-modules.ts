import { aiComplete } from './ai'
import { jsonrepair } from 'jsonrepair'
import type { SupabaseClient } from '@supabase/supabase-js'

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

  return insertedModules
}
