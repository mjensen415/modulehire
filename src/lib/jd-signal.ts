// "Real requirements vs filler" signal pulled from a JD alongside the basics pass:
// requirement-style lines that can't actually be screened for, and whether a degree is
// asked for (and whether it's waivable). Shared by analyze-jd, its Prompt Lab mirror, and
// business job-posting creation (degree only — folded into that route's existing extraction call).

export type DegreeLevel = 'bachelor' | 'master' | 'phd' | 'other'
export type DegreeWaivable = 'equivalent_experience' | 'preferred_only' | 'no'
export type DegreeRequirement = {
  mentioned: boolean
  level: DegreeLevel | null
  waivable: DegreeWaivable | null
  quote: string | null
}

const DEGREE_LEVELS: DegreeLevel[] = ['bachelor', 'master', 'phd', 'other']
const DEGREE_WAIVABLE: DegreeWaivable[] = ['equivalent_experience', 'preferred_only', 'no']

export const FLUFF_PROMPT = `extracted_fluff: up to 15 short verbatim quotes (8 words or fewer each) of requirement-style
lines that can't actually be screened for — personality adjectives ("self-starter", "passion for
excellence"), work-environment descriptions ("thrives in a fast-paced environment"), and catch-alls
("other duties as assigned"). Do NOT include the company pitch, mission statements, or benefits —
only lines dressed up as requirements that aren't real requirements. Empty array if none.`

export const DEGREE_PROMPT = `degree_requirement: whether the posting asks for a degree.
- mentioned: true only if a degree/diploma is mentioned as a requirement or preference.
- level: the MINIMUM degree the posting asks for — "bachelor", "master", "phd", or "other"
  (associate, certificate-as-degree, etc.); null if not mentioned.
- waivable: "equivalent_experience" if ANYWHERE in the posting it says "or equivalent", "comparable
  experience", "in lieu of", or similar (check the whole posting, not just the degree line);
  otherwise "preferred_only" if the degree is "preferred", "a plus", or "nice to have"; otherwise
  "no". null if not mentioned. Judge the MINIMUM degree only: "Bachelor's required; Master's
  preferred" is level "bachelor", waivable "no" — a separately preferred higher degree does not make
  the required one optional.
- quote: the minimum-degree line verbatim (max ~25 words), or null if not mentioned.`

export const FLUFF_SCHEMA_PROP = {
  type: 'array',
  items: { type: 'string' },
  description: 'Up to 15 verbatim quotes (≤8 words) of unscreenable requirement-style filler. No company pitch or benefits.',
}

export const DEGREE_SCHEMA_PROP = {
  type: 'object',
  properties: {
    mentioned: { type: 'boolean' },
    level: { type: ['string', 'null'], enum: [...DEGREE_LEVELS, null] },
    waivable: { type: ['string', 'null'], enum: [...DEGREE_WAIVABLE, null] },
    quote: { type: ['string', 'null'] },
  },
  required: ['mentioned', 'level', 'waivable', 'quote'],
}

export function sanitizeFluff(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    let s = item.trim().replace(/^["“”']+|["“”']+$/g, '').trim()
    if (!s) continue
    const words = s.split(/\s+/)
    if (words.length > 8) s = words.slice(0, 8).join(' ').replace(/[,;:]$/, '') + '…'
    s = s.slice(0, 80)
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= 15) break
  }
  return out
}

export function sanitizeDegree(raw: unknown): DegreeRequirement | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.mentioned !== true) return { mentioned: false, level: null, waivable: null, quote: null }
  const level = DEGREE_LEVELS.includes(r.level as DegreeLevel) ? (r.level as DegreeLevel) : 'other'
  const waivable = DEGREE_WAIVABLE.includes(r.waivable as DegreeWaivable) ? (r.waivable as DegreeWaivable) : 'no'
  const quote = typeof r.quote === 'string' && r.quote.trim() ? r.quote.trim().slice(0, 240) : null
  return { mentioned: true, level, waivable, quote }
}

export function isDegreeWaivable(d: unknown): boolean {
  const deg = sanitizeDegree(d)
  return !!deg?.mentioned && (deg.waivable === 'equivalent_experience' || deg.waivable === 'preferred_only')
}

// Appended to the criteria pass's system prompt (production + Prompt Lab).
export const CRITERIA_REPETITION_PROMPT = `For each criterion also return:
- mentions: how many separate places in the posting ask for this, counting paraphrases as the same
  ask (an integer, at least 1).
- also_called: up to 3 SHORT verbatim phrasings (2-8 words each) lifted from the posting that ask
  for this criterion — the key phrase, not the whole sentence. Never the job title.

Weight rule: a criterion mentioned 3+ times is weight 4 or 5. A criterion mentioned once and only in
a "nice to have" / "bonus" / "preferred" section is weight 2 or lower.

Example of counting a paraphrase: a posting says "Own stakeholder management across Sales and
Product" in the responsibilities, and later "You align cross-functional partners around a shared
roadmap" in the requirements. Those are the same ask → one criterion "Stakeholder Alignment",
mentions: 2, also_called: ["stakeholder management", "align cross-functional partners"].`

// One short worked example for the criteria pass: on Haiku, showing the output beats a paragraph
// of rules. Appended to the criteria system prompt in analyze-jd and its Prompt Lab mirror.
export const CRITERIA_WORKED_EXAMPLE = `Worked example.
Posting: "Customer Education Lead. Build and run our customer training programs and certification
track. Partner with Product and Support on launches. 5+ years in customer education at a SaaS
company; you've managed an LMS. Bonus: video production."
extracted_criteria:
[{"label":"Customer Training Programs","dimension":"responsibility","weight":5,"description":"Builds and runs customer training and certification.","mentions":2,"also_called":["customer training programs","certification track"]},
 {"label":"Customer Education Lead","dimension":"role","weight":4,"description":"Leads customer education as its owner.","mentions":1,"also_called":["Customer Education Lead"]},
 {"label":"Senior Practitioner","dimension":"seniority","weight":3,"description":"5+ years in customer education.","mentions":1,"also_called":["5+ years in customer education"]},
 {"label":"SaaS Customer Education","dimension":"domain","weight":3,"description":"Has done this at a SaaS company.","mentions":1,"also_called":["at a SaaS company"]},
 {"label":"LMS Administration","dimension":"skill","weight":3,"description":"Has managed a learning management system.","mentions":1,"also_called":["managed an LMS"]},
 {"label":"Product and Support Partnership","dimension":"collaboration","weight":2,"description":"Works with Product and Support on launches.","mentions":1,"also_called":["Partner with Product and Support"]},
 {"label":"Video Production","dimension":"skill","weight":1,"description":"Nice to have: can produce video.","mentions":1,"also_called":["video production"]}]`

export const CRITERIA_REPETITION_SCHEMA_PROPS = {
  mentions: { type: 'integer', description: 'How many separate places in the posting ask for this (paraphrases count), 1-9' },
  also_called: { type: 'array', items: { type: 'string' }, description: 'Up to 3 short (2-8 word) verbatim phrasings from the posting' },
}

/**
 * Server-side half of the criteria pass's weight rule, applied to fresh AI output only (not to
 * user-edited criteria): anything the posting asks for in 3+ places is weight 4 or more.
 */
export function applyMentionWeightRule<T extends { weight: number; mentions?: number }>(criteria: T[]): T[] {
  return criteria
    .map(c => ((c.mentions ?? 1) >= 3 && c.weight < 4 ? { ...c, weight: 4 } : c))
    .sort((a, b) => b.weight - a.weight)
}
