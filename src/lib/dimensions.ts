export const DIMENSIONS = ['role', 'seniority', 'responsibility', 'skill', 'domain', 'collaboration'] as const
export type Dimension = typeof DIMENSIONS[number]
export const DIMENSION_LABELS: Record<Dimension, string> = {
  role: 'Role', seniority: 'Seniority', responsibility: 'Responsibility',
  skill: 'Skill', domain: 'Domain', collaboration: 'Collaboration',
}
export function isDimension(v: unknown): v is Dimension {
  return typeof v === 'string' && (DIMENSIONS as readonly string[]).includes(v)
}

export type JdCriterion = {
  label: string
  dimension: Dimension
  weight: number
  description: string
  /** How many separate places in the posting ask for this (paraphrases counted), 1-9. */
  mentions?: number
  /** Up to 3 verbatim phrasings from the posting. */
  also_called?: string[]
}

// Server-side validation for AI-extracted JD criteria — drops malformed entries rather
// than trusting the model's output shape. Shared by analyze-jd, its Prompt Lab mirror,
// and the job_descriptions PATCH route (user-edited criteria go through the same rules).
export function sanitizeCriteria(raw: unknown): JdCriterion[] {
  if (!Array.isArray(raw)) return []
  const out: JdCriterion[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    if (!isDimension(r.dimension)) continue
    const label = typeof r.label === 'string' ? r.label.trim().slice(0, 60) : ''
    if (!label) continue
    const weightNum = Number(r.weight)
    const weight = Number.isFinite(weightNum) ? Math.min(5, Math.max(1, Math.round(weightNum))) : 1
    const description = typeof r.description === 'string' ? r.description.trim().slice(0, 300) : ''
    const mentionsNum = Number(r.mentions)
    const mentions = Number.isFinite(mentionsNum) ? Math.min(9, Math.max(1, Math.round(mentionsNum))) : 1
    const also_called = Array.isArray(r.also_called)
      ? r.also_called.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().slice(0, 80)).slice(0, 3)
      : []
    out.push({ label, dimension: r.dimension, weight, description, mentions, also_called })
    if (out.length >= 9) break
  }
  return out
}
