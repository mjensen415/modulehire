import { aiComplete, aiCompleteJson } from './ai'
import { jsonrepair } from 'jsonrepair'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DIMENSIONS, isDimension } from './dimensions'
import { normalizeCompany } from './resume-dates'

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
const VALID_SKILL_CATEGORIES = new Set(['technical', 'domain', 'leadership'])

export type SkillCategory = 'technical' | 'domain' | 'leadership' | null
export type ExtractedSkill = { skill: string; category: SkillCategory }

const SKILL_EXTRACTION_PROMPT =
  "Extract 5–8 distinct professional skills demonstrated in the following resume bullet points. " +
  "Return ONLY a JSON array. Each item: { skill: string (2–4 words max, title case), " +
  "category: 'technical' | 'domain' | 'leadership' }. Focus on skills a hiring manager would " +
  "care about. No duplicates, no generic terms like 'communication'."

/**
 * Extract a small set of professional skills from joined resume/module content.
 * Returns [] when the model produces no usable array. May throw on malformed JSON
 * (callers wrap this so a skill failure never breaks the surrounding flow).
 */
export async function extractSkillsFromContent(content: string): Promise<ExtractedSkill[]> {
  const raw = await aiComplete(
    [
      { role: 'system', content: SKILL_EXTRACTION_PROMPT },
      { role: 'user', content },
    ],
    600,
    { tier: 'fast' }
  )

  const stripped = raw.replace(/```json/g, '').replace(/```/g, '').trim()
  const start = stripped.indexOf('[')
  const end = stripped.lastIndexOf(']')
  if (start === -1 || end === -1) return []

  const parsed = JSON.parse(jsonrepair(stripped.slice(start, end + 1)))
  if (!Array.isArray(parsed)) return []

  const seen = new Set<string>()
  const skills: ExtractedSkill[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const skill = typeof r.skill === 'string' ? r.skill.trim() : ''
    if (!skill) continue
    const dedupeKey = skill.toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    const category: SkillCategory = VALID_SKILL_CATEGORIES.has(r.category as string)
      ? (r.category as Exclude<SkillCategory, null>)
      : null
    skills.push({ skill, category })
  }
  return skills
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

// Normalize a date string to YYYY-MM, or null if it represents "present" / is unparseable.
function normalizeDate(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s || s.toLowerCase() === 'present') return null
  // Already YYYY-MM
  if (/^\d{4}-\d{2}$/.test(s)) return s
  // Just a year → assume January
  if (/^\d{4}$/.test(s)) return `${s}-01`
  // "Jan 2020" / "January 2020"
  const mY = s.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (mY) {
    const mon = MONTH_MAP[mY[1].toLowerCase().slice(0, 3)]
    if (mon) return `${mY[2]}-${mon}`
  }
  // "2020/01" or "2020-1"
  const yM = s.match(/^(\d{4})[-/](\d{1,2})$/)
  if (yM) return `${yM[1]}-${yM[2].padStart(2, '0')}`
  // "01/2020" or "01-2020"
  const mYslash = s.match(/^(\d{1,2})[-/](\d{4})$/)
  if (mYslash) return `${mYslash[2]}-${mYslash[1].padStart(2, '0')}`
  // Couldn't parse — return null rather than storing garbage
  return null
}

const toArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === 'string' && v.length > 0) return [v]
  return []
}

// Strip "(acquired by X)"-style parentheticals from a company name.
function cleanCompany(raw: unknown): string {
  return String(raw ?? '').replace(/\s*\([^)]*\)/g, '').trim()
}

// A company field naming several employers: a comma list ("Skipify, Plex, Twitter"), or a
// slash list whose parts are 2+ of the resume's own roles. "Microsoft / Yammer" stays one
// employer unless the outline lists Microsoft and Yammer as separate jobs.
function isMultiCompany(company: string, knownCompanies: Set<string>): boolean {
  if (/,|;/.test(company)) return company.split(/\s*[,;]\s*/).filter(Boolean).length > 1
  if (company.includes('/')) {
    const matches = company.split(/\s*\/\s*/).filter(part => knownCompanies.has(normalizeCompany(part)))
    return matches.length >= 2
  }
  return false
}

// Every persisted module belongs to exactly one job, or to none. A module the model attributed
// to several employers is summary/skills material from a career-level section, so it becomes a
// positioning module with no company — never a clone under each job (that duplicated content
// and produced combined "Skipify, Plex, Twitter" entries on generated resumes). The title is
// kept whole: "SENIOR VICE PRESIDENT, People" is one title, not two.
function attributeModule(m: Record<string, unknown>, knownCompanies: Set<string>): Record<string, unknown> {
  const company = cleanCompany(m.source_company)
  if (company && isMultiCompany(company, knownCompanies)) {
    return { ...m, source_company: null, source_role_title: null, date_start: null, date_end: null, type: 'positioning' }
  }
  const role = String(m.source_role_title ?? '').trim()
  return { ...m, source_company: company || null, source_role_title: role || null }
}

// ─── Duplicate detection ─────────────────────────────────────────────────────

function contentTokens(text: unknown): Set<string> {
  return new Set(String(text ?? '').toLowerCase().replace(/[^a-z0-9%$\s]/g, ' ').split(/\s+/).filter(w => w.length > 1))
}

// Dice coefficient over normalized word sets: 1 = same words.
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const w of a) if (b.has(w)) shared++
  return (2 * shared) / (a.size + b.size)
}

const DUPLICATE_THRESHOLD = 0.9

// Tracks module content already in the profile (from earlier uploads) and already accepted in
// this upload. Within one upload any >90% match is a duplicate (the same job read twice under
// two titles); against earlier uploads it must also be the same company.
type DedupeState = {
  existing: { company: string; tokens: Set<string> }[]
  accepted: Set<string>[]
}

function takeIfNew(m: Record<string, unknown>, state: DedupeState): boolean {
  const tokens = contentTokens(m.content)
  if (tokens.size === 0) return true
  if (state.accepted.some(t => similarity(t, tokens) > DUPLICATE_THRESHOLD)) return false
  const company = normalizeCompany(m.source_company)
  if (state.existing.some(e => e.company === company && similarity(e.tokens, tokens) > DUPLICATE_THRESHOLD)) return false
  state.accepted.push(tokens)
  return true
}

type EducationEntry = { school: string; degree: string; field: string; year: string }
type ContactInfo = {
  full_name: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  location: string | null
  summary: string | null
  education: EducationEntry[]
}

const EMPTY_CONTACT: ContactInfo = {
  full_name: null, email: null, phone: null, linkedin_url: null, location: null, summary: null, education: [],
}

// Extract contact info + summary + education from the resume (small, fast call). Only depends
// on rawText, so the caller starts this concurrently with the module-parse calls instead of
// waiting for them to finish first. Best-effort — never throws; falls back to EMPTY_CONTACT so
// a failure here can't break the surrounding parse.
async function extractContactInfo(rawText: string): Promise<ContactInfo> {
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

    const contactRaw = await aiComplete([{ role: 'user', content: contactPrompt }], 1000, { tier: 'fast' })
    const stripped = contactRaw.replace(/```json/g, '').replace(/```/g, '').trim()
    const jsonStart = stripped.indexOf('{')
    const jsonEnd = stripped.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) return EMPTY_CONTACT

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

    return {
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
  } catch {
    // Contact extraction is best-effort — don't fail the whole parse
    return EMPTY_CONTACT
  }
}

// ─── Outline pass ───────────────────────────────────────────────────────────

export type OutlineRole = { index: number; company: string; title: string | null; date_start: string | null; date_end: string | null; start_anchor?: string | null }

const OUTLINE_SYSTEM_PROMPT = `Identify every distinct job or role in this resume, in the order they appear (most recent first, matching the resume's own order). For each, give its 0-based index, company, title, and dates.

A role is one company plus one date range.
- The title is everything written on the title line, including text after a comma or inside parentheses: "SENIOR VICE PRESIDENT, People" and "DIRECTOR, OPERATIONS (People & Finance)" are each ONE title for ONE role. Never split a title at a comma.
- Two roles may not share the same company and the same date range. Promotions at one company are separate roles only when they have their own dates.
- "company" is exactly one employer, never a list.

Do NOT include the resume's top-level Summary, Profile, Objective, Skills, or About section as a role, even when it names several past employers.

has_extras: true if the resume has non-role content worth extracting as its own modules — standalone skills, side projects, open-source contributions, awards, certifications. False if everything of substance belongs to a specific role.`

const OUTLINE_SCHEMA = {
  type: 'object',
  properties: {
    roles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'number' },
          company: { type: 'string' },
          title: { type: 'string' },
          date_start: { type: 'string', description: 'YYYY-MM, or empty string if not stated' },
          date_end: { type: 'string', description: 'YYYY-MM, "present", or empty string if not stated' },
          start_anchor: { type: 'string', description: 'The first 8 words of this role\'s section, copied exactly as written in the resume (usually its company or title line)' },
        },
        required: ['index', 'company', 'title', 'date_start', 'date_end', 'start_anchor'],
      },
    },
    has_extras: { type: 'boolean' },
  },
  required: ['roles', 'has_extras'],
}

// Safety net for the outline splitting one role into two at a comma ("SENIOR VICE PRESIDENT" +
// "People"): roles with the same company and dates are one role, their title parts rejoined.
function mergeSplitRoles(roles: OutlineRole[]): OutlineRole[] {
  const merged: OutlineRole[] = []
  for (const r of roles) {
    const same = merged.find(m =>
      normalizeCompany(m.company) === normalizeCompany(r.company) &&
      m.date_start === r.date_start && m.date_end === r.date_end)
    if (!same) { merged.push({ ...r }); continue }
    if (r.title && !(same.title ?? '').toLowerCase().includes(r.title.toLowerCase())) {
      same.title = same.title ? `${same.title}, ${r.title}` : r.title
    }
  }
  return merged.map((r, i) => ({ ...r, index: i }))
}

export async function extractOutline(rawText: string, userId: string): Promise<{ roles: OutlineRole[]; hasExtras: boolean }> {
  try {
    const result = await aiCompleteJson<{ roles: Array<Record<string, unknown>>; has_extras: boolean }>(
      [
        { role: 'system', content: OUTLINE_SYSTEM_PROMPT },
        { role: 'user', content: `Resume:\n${rawText}` },
      ],
      OUTLINE_SCHEMA,
      1600,
      { tier: 'fast', userId, action: 'parse_modules' }
    )
    const roles = (result.roles ?? [])
      .map((r, i): OutlineRole | null => {
        const company = String(r.company ?? '').trim()
        if (!company) return null
        return {
          index: typeof r.index === 'number' ? r.index : i,
          company,
          title: String(r.title ?? '').trim() || null,
          date_start: normalizeDate(r.date_start),
          date_end: normalizeDate(r.date_end),
          start_anchor: String(r.start_anchor ?? '').trim() || null,
        }
      })
      .filter((r): r is OutlineRole => r !== null)
    return { roles: mergeSplitRoles(roles), hasExtras: !!result.has_extras }
  } catch (err) {
    console.error('[parseModules] outline pass failed, falling back to single-call parse:', err)
    return { roles: [], hasExtras: false }
  }
}

// ─── Module extraction (shared by the per-role, extras, and single-call fallback paths) ──

const MODULE_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['experience', 'skill', 'story', 'positioning'] },
    title: { type: 'string', description: 'Skill domain name' },
    content: { type: 'string', description: '2-4 sentence paragraph — preserve all metrics verbatim' },
    source_company: { type: 'string' },
    source_role_title: { type: 'string', description: 'Job title exactly as written' },
    date_start: { type: 'string', description: 'YYYY-MM' },
    date_end: { type: 'string', description: 'YYYY-MM or present' },
    employment_type: { type: 'string', enum: ['full-time', 'consulting', 'contract', 'board', 'volunteer'] },
    weight: { type: 'string', enum: ['anchor', 'strong', 'supporting'] },
    role_types: { type: 'array', items: { type: 'string' } },
    themes: { type: 'array', items: { type: 'string' } },
    company_stage: { type: 'array', items: { type: 'string', enum: ['startup', 'growth', 'enterprise', 'any'] } },
    dimensions: { type: 'array', items: { type: 'string', enum: DIMENSIONS as unknown as string[] }, description: '1-3 values — which aspects of a candidate this module is evidence for' },
  },
  required: ['type', 'title', 'content', 'source_company', 'source_role_title', 'date_start', 'date_end', 'employment_type', 'weight', 'role_types', 'themes', 'company_stage', 'dimensions'],
}

const PARSE_MODULES_SCHEMA = {
  type: 'object',
  properties: {
    modules: { type: 'array', items: MODULE_ITEM_SCHEMA },
  },
  required: ['modules'],
}

const PARSE_MODULES_SYSTEM_PROMPT = `You are a resume parsing expert. Decompose the resume below into modular skill blocks.

RULES:
- Create one module per meaningful cluster of related work. Prefer specificity over consolidation — a notable project, achievement, or sub-specialization should be its own module even if it overlaps in topic with another module from the same job.
- A single role will often produce many modules. That is expected and correct. The user curates from abundance — do not filter on their behalf.
- Err on the side of more modules rather than fewer. Do not drop or merge significant achievements, projects, or responsibilities to keep the list short.
- CRITICAL: Each module belongs to exactly ONE job. It must carry exactly one "source_company" and
  exactly one "source_role_title". Do NOT combine companies or roles in a single module.
  If an accomplishment spans multiple roles, attribute it to the single role where it was most
  relevant (prefer the most recent), or emit a separate module for each role — never a list.
- "source_company" MUST NOT be a comma-separated list of companies. If the resume groups multiple
  distinct employers under one date range, emit one module per employer.
  Slash-joined names like "Microsoft / Yammer" are allowed when they describe a single employer
  (e.g. an acquired company under a parent). Acquired-by parentheticals like "(acquired by X)"
  should be stripped — keep only the original employer name.
- "source_role_title" MUST be a single job title exactly as written, NOT a comma-separated list of
  titles. Slash-joined dual titles like "Product & Design Lead" are fine for one role.
- DO NOT emit a module for the resume's top-level Summary, Profile, Objective, or About section.
  That content belongs on the user's profile, not in the module library — the caller extracts it
  separately. Skip it entirely.

MODULE TYPE — choose the most accurate:
- "experience": work delivered at a specific job (default for most modules)
- "skill": a capability not tied to a single role (e.g. "SQL", "Public Speaking", "Python")
- "story": a specific project or initiative with a clear arc and measurable outcome
- "positioning": a point of view, philosophy, or differentiating perspective about the candidate's work

MODULE WEIGHT — assign based on significance within this role:
- "anchor": the single most important achievement or flagship responsibility from this role (limit 1–2 per role)
- "strong": a major responsibility or achievement with meaningful scope, scale, or outcome
- "supporting": a specific project, sub-skill, or accomplishment that adds depth but is not a headline item

CONTENT RULES:
- Preserve all specific metrics, percentages, team sizes, revenue figures, and outcomes VERBATIM as they appear in the resume. Do not paraphrase or soften specific claims.
- Write in third-person past tense (e.g. "Led a team of 12...", "Grew community from 0 to 50k members in 18 months").
- Each module's content should be 2–4 sentences, self-contained, and read as a standalone accomplishment summary.

THEMES — pick only from this exact list (omit any that don't apply):
community-building, community-marketing, community-programs, community-ops, community-health, ambassador-programs, member-lifecycle, retention, engagement, developer-relations, developer-enablement, feedback-loops, ai, technical-content, hackathons, product-collaboration, product-advisory, cross-functional, data-driven, zero-to-one, scale, growth, brand, content-strategy, events, enablement, partnerships, lifecycle-marketing, leadership, executive, consulting, startup

ROLE TYPES — pick only from this exact list (omit any that don't apply):
vp-community, head-of-community, director-community, senior-manager-community, community-manager, developer-relations, developer-advocacy, developer-community-manager, community-marketing, community-ops, community-enablement, content-strategy, ic-community

themes: values from the THEMES list above. role_types: values from the ROLE TYPES list above.

WORKED EXAMPLE
Resume section:
  Lumen Health — Community Manager, Mar 2019 – Jun 2022
  • Grew the patient community from 2,000 to 11,000 members in 18 months
  • Launched a 40-person ambassador program that ran monthly local meetups
  • Wrote the moderation playbook adopted by the support team
Modules:
[{"type":"experience","title":"Community Growth","content":"Grew the Lumen Health patient community from 2,000 to 11,000 members in 18 months.","source_company":"Lumen Health","source_role_title":"Community Manager","date_start":"2019-03","date_end":"2022-06","employment_type":"full-time","weight":"anchor","role_types":["community-manager"],"themes":["community-building","growth"],"company_stage":["growth"],"dimensions":["responsibility"]},
 {"type":"story","title":"Ambassador Program","content":"Launched a 40-person ambassador program that ran monthly local meetups.","source_company":"Lumen Health","source_role_title":"Community Manager","date_start":"2019-03","date_end":"2022-06","employment_type":"full-time","weight":"strong","role_types":["community-manager"],"themes":["ambassador-programs","events"],"company_stage":["growth"],"dimensions":["responsibility","collaboration"]},
 {"type":"experience","title":"Moderation Playbook","content":"Wrote the moderation playbook adopted by the support team.","source_company":"Lumen Health","source_role_title":"Community Manager","date_start":"2019-03","date_end":"2022-06","employment_type":"full-time","weight":"supporting","role_types":["community-manager"],"themes":["community-ops"],"company_stage":["growth"],"dimensions":["skill"]}]
Every number is copied exactly; nothing is added that the section doesn't say.`

const EXTRAS_FOCUS_INSTRUCTION = 'Extract modules only from content that is NOT part of a specific role — standalone skills, side projects, open-source contributions, awards, certifications. Do NOT create a module for the Summary/Profile/Objective/About section.'

export function roleFocusInstruction(role: OutlineRole): string {
  const dates = role.date_start ? ` (${role.date_start} to ${role.date_end ?? 'present'})` : ''
  return `Extract modules only for this role: #${role.index} — ${role.title ?? 'this role'} at ${role.company}${dates}. Only emit modules whose source_company and source_role_title match this role.`
}

// Where a role's section starts: its start_anchor found in the text, exactly or ignoring
// whitespace and case. -1 when the anchor isn't there.
function anchorPosition(rawText: string, anchor: string | null | undefined): number {
  if (!anchor) return -1
  const exact = rawText.indexOf(anchor)
  if (exact >= 0) return exact
  // Whitespace/case-insensitive: compare on a collapsed copy, mapping back to original offsets.
  const map: number[] = []
  let collapsed = ''
  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i]
    if (/\s/.test(ch)) { if (collapsed.endsWith(' ')) continue; collapsed += ' ' } else collapsed += ch.toLowerCase()
    map.push(i)
  }
  const needle = anchor.replace(/\s+/g, ' ').trim().toLowerCase()
  const at = collapsed.indexOf(needle)
  return at >= 0 ? map[at] : -1
}

/**
 * Just this role's part of the resume: from its anchor to the next role's anchor. Per-role
 * calls used to re-send the whole resume (~4-5k tokens each); on Haiku the prompt is under the
 * caching minimum, so slicing saves more than caching did. null → use the full text.
 */
export function roleSlice(rawText: string, roles: OutlineRole[], role: OutlineRole): string | null {
  const start = anchorPosition(rawText, role.start_anchor)
  if (start < 0) return null
  const later = roles
    .filter(r => r !== role)
    .map(r => anchorPosition(rawText, r.start_anchor))
    .filter(p => p > start)
  const end = later.length > 0 ? Math.min(...later) : rawText.length
  const slice = rawText.slice(start, end).trim()
  return slice.length >= 40 ? slice : null
}

// Shared extraction call. `focusInstruction` narrows the call to one role (or the "extras"
// bucket) via an uncached trailing block; the instructions + full resume text stay in a
// cached leading block so parallel per-role calls reuse the same prompt-cache entry instead
// of re-billing the whole resume on every call. `focusInstruction: null` is the fallback
// single-call path — same shape as the original whole-resume extraction.
export async function extractModulesWithFocus(
  rawText: string,
  focusInstruction: string | null,
  userId: string,
  opts: { slice?: string | null; temperature?: number } = {},
): Promise<Record<string, unknown>[]> {
  const content: Array<{ text: string; cache?: boolean }> = opts.slice
    ? [{ text: `${PARSE_MODULES_SYSTEM_PROMPT}\n\nResume section for this role:\n${opts.slice}` }]
    : [{ text: `${PARSE_MODULES_SYSTEM_PROMPT}\n\nResume:\n${rawText}`, cache: true }]
  if (focusInstruction) content.push({ text: focusInstruction })

  const { modules } = await aiCompleteJson<{ modules: Record<string, unknown>[] }>(
    [
      { role: 'system', content: 'You are a resume parsing expert.' },
      { role: 'user', content },
    ],
    PARSE_MODULES_SCHEMA,
    // Per-role: Haiku writes more modules per role than Sonnet did and overran 2048 on long
    // roles (the call is cut off and retried), so the cap went up rather than down.
    focusInstruction ? 3200 : 8192,
    { tier: 'quality', userId, action: 'parse_modules', ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}) }
  )
  // Forced tool-use is reliable but not airtight — on thin/sparse content the model has
  // returned `modules` as something other than an array (null, a single object). Never
  // let a malformed response propagate into array methods downstream.
  return Array.isArray(modules) ? modules : []
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function sanitizeModule(m: Record<string, unknown>, userId: string, profileId: string, resumeId: string) {
  return {
    ...m,
    user_id: userId,
    profile_id: profileId,
    source_resume_id: resumeId,
    role_types:    toArray(m.role_types),
    themes:        toArray(m.themes),
    company_stage: toArray(m.company_stage),
    dimensions:    toArray(m.dimensions).filter(isDimension).slice(0, 3),
    type:            VALID_TYPES.has(m.type as string)           ? m.type           : 'experience',
    weight:          VALID_WEIGHTS.has(m.weight as string)       ? m.weight         : 'supporting',
    employment_type: VALID_EMP_TYPES.has(m.employment_type as string) ? m.employment_type : 'full-time',
    title:           m.title   ?? 'Untitled Module',
    content:         m.content ?? '',
    // Normalize to YYYY-MM; "present" / unparseable → null so downstream null-checks work
    date_start: normalizeDate(m.date_start),
    date_end:   normalizeDate(m.date_end),
  }
}

type BatchContext = {
  knownCompanies: Set<string>
  dedupe: DedupeState
  // The outline role this batch was extracted for. Its company, title and dates win over the
  // model's per-module values, so job records get the outline's dates — never a range widened
  // across modules — and a split title can't create a second job.
  role?: OutlineRole
}

async function insertModulesBatch(
  supabase: SupabaseClient,
  userId: string,
  profileId: string,
  resumeId: string,
  rawModules: Record<string, unknown>[],
  ctx: BatchContext
): Promise<Record<string, unknown>[]> {
  // Defensive: forced tool-use is reliable but not airtight — on a thin resume the model has
  // occasionally returned a bare string in the modules array instead of an object. Spreading
  // a string (`{ ...m }`) silently fans it out into numeric-keyed properties ('0', '1', ...),
  // which Postgres then rejects as unknown columns. Drop anything that isn't a plain object.
  const validModules = (Array.isArray(rawModules) ? rawModules : [])
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object' && !Array.isArray(m))

  const attributed = validModules
    .map(m => attributeModule(m, ctx.knownCompanies))
    .map(m => {
      const role = ctx.role
      if (!role || !m.source_company || m.type === 'positioning') return m
      return { ...m, source_company: role.company, source_role_title: role.title, date_start: role.date_start, date_end: role.date_end }
    })
    // Runs synchronously between awaits, so parallel role batches can't both take one duplicate.
    .filter(m => takeIfNew(m, ctx.dedupe))
  if (attributed.length === 0) return []

  const toInsert = attributed.map(m => sanitizeModule(m, userId, profileId, resumeId))
  const { data, error } = await supabase.from('modules').insert(toInsert).select()
  if (error) throw error
  return data ?? []
}

export type ParseProgressEvent =
  | { type: 'outline'; roles: OutlineRole[]; extras: boolean }
  | { type: 'role_done'; index: number; company: string; title: string | null; modules: Array<{ id: string; title: string; type: string; dimensions: string[] }> }
  | { type: 'role_failed'; index: number; company: string; title: string | null }
  | { type: 'contact'; name: string | null }

export async function parseModules(
  supabase: SupabaseClient,
  userId: string,
  resumeId: string,
  rawText: string,
  profileId: string,
  onEvent?: (event: ParseProgressEvent) => void
) {
  // Contact/summary/education extraction only needs rawText — start it now so it runs
  // concurrently with module parsing and the DB work that follows.
  const contactPromise = extractContactInfo(rawText).then(contact => {
    onEvent?.({ type: 'contact', name: contact.full_name })
    return contact
  })

  const [{ roles: outlineRoles, hasExtras }, { data: existingModules }] = await Promise.all([
    extractOutline(rawText, userId),
    // Modules already in this profile from earlier uploads — a second resume for the same
    // person shouldn't re-add the same accomplishments.
    supabase
      .from('modules')
      .select('source_company, content')
      .eq('user_id', userId)
      .eq('profile_id', profileId)
      .is('deleted_at', null),
  ])
  onEvent?.({ type: 'outline', roles: outlineRoles, extras: hasExtras })

  const knownCompanies = new Set(outlineRoles.map(r => normalizeCompany(r.company)))
  const dedupe: DedupeState = {
    existing: (existingModules ?? []).map(m => ({ company: normalizeCompany(m.source_company), tokens: contentTokens(m.content) })),
    accepted: [],
  }

  let allInsertedModules: Record<string, unknown>[] = []

  if (outlineRoles.length <= 1) {
    // 0 or 1 roles found — not worth splitting into parallel calls; parse the whole
    // resume in one call like before.
    const rawModulesData = await extractModulesWithFocus(rawText, null, userId)
    // With one outline role, modules from that employer take its title and dates.
    const onlyRole = outlineRoles[0]
    const forRole = onlyRole
      ? rawModulesData.filter(m => m && typeof m === 'object' && normalizeCompany(cleanCompany(m.source_company)) === normalizeCompany(onlyRole.company))
      : []
    const others = rawModulesData.filter(m => !forRole.includes(m))
    const inserted = [
      ...await insertModulesBatch(supabase, userId, profileId, resumeId, forRole, { knownCompanies, dedupe, role: onlyRole }),
      ...await insertModulesBatch(supabase, userId, profileId, resumeId, others, { knownCompanies, dedupe }),
    ]
    allInsertedModules = inserted
    if (outlineRoles.length === 1) {
      const role = outlineRoles[0]
      onEvent?.({
        type: 'role_done',
        index: role.index,
        company: role.company,
        title: role.title,
        modules: inserted.map(m => ({ id: String(m.id), title: String(m.title), type: String(m.type), dimensions: (m.dimensions as string[]) ?? [] })),
      })
    }
  } else {
    type Task = { kind: 'role'; role: OutlineRole } | { kind: 'extras' }
    const tasks: Task[] = [...outlineRoles.map((role): Task => ({ kind: 'role', role }))]
    if (hasExtras) tasks.push({ kind: 'extras' })

    const CONCURRENCY = 6
    const perTask = await mapLimit(tasks, CONCURRENCY, async (task): Promise<Record<string, unknown>[]> => {
      const focusInstruction = task.kind === 'role' ? roleFocusInstruction(task.role) : EXTRAS_FOCUS_INSTRUCTION
      const taskLabel = task.kind === 'role' ? task.role.index : 'extras'
      let rawModulesData: Record<string, unknown>[] | null = null
      // Retry on a thrown error OR an empty result — a role with real resume content
      // coming back with zero modules is a quality failure just as much as an exception
      // (seen in practice: forced tool-use occasionally returns an empty/malformed array
      // for one role in a multi-role batch even though its content is clearly there).
      const slice = task.kind === 'role' ? roleSlice(rawText, outlineRoles, task.role) : null
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          // The retry runs at temperature 0, on the full text if the slice came back empty.
          const result = await extractModulesWithFocus(rawText, focusInstruction, userId, attempt === 1
            ? { slice }
            : { slice: null, temperature: 0 })
          if (result.length > 0) { rawModulesData = result; break }
          console.error(`[parseModules] task ${taskLabel} attempt ${attempt} returned no modules, retrying`)
        } catch (err) {
          console.error(`[parseModules] task ${taskLabel} attempt ${attempt} failed:`, err)
        }
      }
      // Extras has no outline entry to attach to, so it's streamed with a sentinel index
      // (-1) — the client folds its modules into the running total/breakdown without
      // rendering a timeline card for it.
      if (rawModulesData === null) {
        onEvent?.(task.kind === 'role'
          ? { type: 'role_failed', index: task.role.index, company: task.role.company, title: task.role.title }
          : { type: 'role_failed', index: -1, company: '', title: null })
        return []
      }
      try {
        const inserted = await insertModulesBatch(supabase, userId, profileId, resumeId, rawModulesData, {
          knownCompanies,
          dedupe,
          role: task.kind === 'role' ? task.role : undefined,
        })
        onEvent?.(task.kind === 'role'
          ? {
              type: 'role_done',
              index: task.role.index,
              company: task.role.company,
              title: task.role.title,
              modules: inserted.map(m => ({ id: String(m.id), title: String(m.title), type: String(m.type), dimensions: (m.dimensions as string[]) ?? [] })),
            }
          : {
              type: 'role_done',
              index: -1,
              company: '',
              title: null,
              modules: inserted.map(m => ({ id: String(m.id), title: String(m.title), type: String(m.type), dimensions: (m.dimensions as string[]) ?? [] })),
            })
        return inserted
      } catch (err) {
        console.error(`[parseModules] insert failed for task ${taskLabel}:`, err)
        onEvent?.(task.kind === 'role'
          ? { type: 'role_failed', index: task.role.index, company: task.role.company, title: task.role.title }
          : { type: 'role_failed', index: -1, company: '', title: null })
        return []
      }
    })

    allInsertedModules = perTask.flat()
  }

  // Additive: upsert job_experiences and module_job_assignments using admin client (bypasses
  // RLS). Operates on the already-inserted module rows regardless of which path produced them.
  let jobSyncError: string | undefined
  let jobExperienceIds: string[] = []
  const jobContentMap = new Map<string, string[]>()
  try {
    const admin = getAdminClient()

    const seen = new Set<string>()
    const uniqueExperiences: {
      company: string
      title: string | null
      start_date: string | null
      end_date: string | null
      employment_type: string
    }[] = []

    for (const m of allInsertedModules) {
      const company   = String(m.source_company    ?? '').trim()
      const roleTitle  = String(m.source_role_title ?? '').trim()
      const dateStart  = typeof m.date_start === 'string' ? m.date_start : null
      const dateEnd    = typeof m.date_end   === 'string' ? m.date_end   : null
      if (!company) continue
      const key = `${company}||${roleTitle}||${dateStart ?? ''}`
      if (!seen.has(key)) {
        seen.add(key)
        uniqueExperiences.push({
          company,
          title:            roleTitle || null,
          start_date:       dateStart ? `${dateStart}-01` : null,
          end_date:         dateEnd   ? `${dateEnd}-01`   : null,
          employment_type:  String(m.employment_type ?? 'full-time'),
        })
      }
    }

    if (uniqueExperiences.length > 0) {
      const { error: jeError } = await admin
        .from('job_experiences')
        .upsert(
          uniqueExperiences.map(e => ({ user_id: userId, ...e })),
          { onConflict: 'user_id,company,title,start_date', ignoreDuplicates: true }
        )
      if (jeError) throw jeError

      const companies = [...new Set(uniqueExperiences.map(e => e.company))]
      const { data: jobExperiences, error: fetchError } = await admin
        .from('job_experiences')
        .select('id, company, title, start_date')
        .eq('user_id', userId)
        .in('company', companies)
      if (fetchError) throw fetchError

      const jobLookup = new Map<string, string>()
      for (const je of (jobExperiences ?? [])) {
        const k = `${je.company}||${je.title ?? ''}||${je.start_date ?? ''}`
        jobLookup.set(k, je.id)
      }

      jobExperienceIds = [...new Set(
        uniqueExperiences
          .map(e => jobLookup.get(`${e.company}||${e.title ?? ''}||${e.start_date ?? ''}`))
          .filter((id): id is string => Boolean(id)),
      )]

      const assignments: { module_id: string; job_id: string }[] = []
      for (const mod of allInsertedModules) {
        const company   = String(mod.source_company    ?? '').trim()
        const roleTitle = String(mod.source_role_title ?? '').trim()
        const dateStart = mod.date_start ? `${String(mod.date_start).trim()}-01` : ''
        const k = `${company}||${roleTitle}||${dateStart}`
        const jobId = jobLookup.get(k)
        if (jobId) {
          assignments.push({ module_id: String(mod.id), job_id: jobId })
          const content = String(mod.content ?? '').trim()
          if (content) {
            const existing = jobContentMap.get(jobId) ?? []
            existing.push(content)
            jobContentMap.set(jobId, existing)
          }
        }
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

  // Auto-populate skills per job from its module content. Best-effort: a failure
  // here must never break the parse, so the whole block is guarded.
  try {
    const admin = getAdminClient()
    for (const [jobId, contents] of jobContentMap) {
      try {
        const joined = contents.join('\n\n')
        if (!joined.trim()) continue
        const skills = await extractSkillsFromContent(joined)
        if (skills.length === 0) continue

        // ON CONFLICT DO NOTHING on (job_id, name) so user-confirmed skills win.
        const { error } = await admin
          .from('job_skills')
          .upsert(
            skills.map(s => ({
              user_id: userId,
              job_id: jobId,
              name: s.skill,
              category: s.category,
              source: 'parsed',
            })),
            { onConflict: 'job_id,name', ignoreDuplicates: true }
          )
        if (error) throw error
      } catch (jobErr) {
        // One job failing shouldn't stop the others.
        console.error(`[parse-modules/skills] extraction failed for job ${jobId}:`, jobErr)
      }
    }
  } catch (err) {
    console.error('[parse-modules/skills] skill auto-population failed:', err)
  }

  // Contact/summary/education call was started concurrently at the top of this function —
  // by now it's almost certainly already resolved, since it ran alongside the module-parse
  // calls and all the DB work above, not after them.
  const contact = await contactPromise

  return { modules: allInsertedModules, contact, jobSyncError, jobExperienceIds }
}
