// Scores a JD's criteria against evidence (library modules for the match report, or the
// sections of an edited resume for the live editor's server fit). One shared prompt and formula,
// so both numbers are on the same scale.
import { aiCompleteJson } from '@/lib/ai'
import { isDimension, type JdCriterion } from '@/lib/dimensions'

export type Evidence = {
  id: string
  title: string
  content: string
  /** Shown only for criteria of these dimensions; untagged evidence is shown for every criterion. */
  dimensions?: string[] | null
  label?: string
  source_company?: string | null
}

type CriterionResult = { label: string; score: number; evidence_module_ids: string[]; why: string }

export type CriteriaReport = {
  overall: number
  criteria: Array<{
    label: string
    dimension: JdCriterion['dimension']
    weight: number
    score: number
    bucket: 'strong' | 'partial' | 'gap'
    why: string
    evidence: Array<{ id: string; title: string; source_company: string | null }>
  }>
  strong: string[]
  gaps: string[]
  generated_at: string
}

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Exact label from the criterion list above' },
          score: { type: 'number', description: '0-100' },
          evidence_module_ids: { type: 'array', items: { type: 'string' }, description: 'Up to 3 module ids that best prove this criterion, or empty if none' },
          why: { type: 'string', description: 'Max 15 words, plain English, second person' },
        },
        required: ['label', 'score', 'evidence_module_ids', 'why'],
      },
    },
  },
  required: ['criteria'],
}

export async function scoreCriteria(
  criteria: JdCriterion[],
  evidenceItems: Evidence[],
  jobLabel: string,
  opts: { userId: string; action: string },
): Promise<CriteriaReport> {
  const modules = evidenceItems
  const criteriaBlock = criteria.map((c, i) => {
    // Untagged modules (pre-backfill) are shown for every criterion so nothing is silently
    // excluded; tagged modules are shown only for their matching dimension to keep the prompt small.
    const relevant = (modules ?? []).filter(m => {
      const dims = Array.isArray(m.dimensions) ? m.dimensions.filter(isDimension) : []
      return dims.length === 0 || dims.includes(c.dimension)
    })
    const moduleLines = relevant.length > 0
      ? relevant.map(m =>
          `  - id: ${m.id} | title: ${m.title}${m.label ? ` | ${m.label}` : ''}\n    content: ${String(m.content ?? '').slice(0, 600)}`
        ).join('\n')
      : '  (no tagged modules for this dimension)'
    return `CRITERION ${i + 1}: "${c.label}" [${c.dimension}] — weight ${c.weight}/5\n${c.description}\nCandidate modules that may be relevant:\n${moduleLines}`
  }).join('\n\n')

  const systemPrompt = `You are scoring how well a candidate's resume modules satisfy each requirement of a job description, one criterion at a time. Be conservative — don't give credit for keyword overlap alone, only for real evidence.

Scoring guide:
- 85-100: direct, specific, recent evidence at the right level
- 60-84: clear evidence but at a lower level, less recent, or less specific
- 30-59: adjacent or partial evidence
- 0-29: nothing relevant in the candidate's modules

For each criterion, pick up to 3 module ids that best prove it (fewer or none if the evidence is weak). "why" is max 15 words, plain English, second person (e.g. "You've led teams this size before, but not in this industry.").`

  const userPrompt = `JOB: ${jobLabel}

${criteriaBlock}

Score every criterion listed above and return one entry per criterion, using its exact label.`

  const aiResult = await aiCompleteJson<{ criteria: CriterionResult[] }>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    RESULT_SCHEMA,
    4096,
    { tier: 'quality', userId: opts.userId, action: opts.action }
  )

  const moduleMap = new Map((modules ?? []).map(m => [m.id, m]))
  const resultByLabel = new Map(aiResult.criteria.map(c => [c.label, c]))

  let weightedSum = 0
  let weightSum = 0
  const criteriaOut = criteria.map(c => {
    const r = resultByLabel.get(c.label)
    const score = r ? Math.max(0, Math.min(100, Math.round(r.score))) : 0
    weightedSum += c.weight * score
    weightSum += c.weight
    const bucket: 'strong' | 'partial' | 'gap' = score >= 70 ? 'strong' : score >= 40 ? 'partial' : 'gap'
    // Evidence ids must belong to this user's own module set — never trust the model's ids blindly.
    const evidence = (r?.evidence_module_ids ?? [])
      .filter(id => moduleMap.has(id))
      .slice(0, 3)
      .map(id => {
        const m = moduleMap.get(id)!
        return { id: m.id, title: m.title, source_company: m.source_company ?? null }
      })
    return {
      label: c.label,
      dimension: c.dimension,
      weight: c.weight,
      score,
      bucket,
      why: typeof r?.why === 'string' ? r.why.trim().slice(0, 200) : '',
      evidence,
    }
  })

  const overall = weightSum > 0 ? Math.round(weightedSum / weightSum) : 0
  const strong = criteriaOut.filter(c => c.bucket === 'strong').map(c => c.label)
  const gaps = criteriaOut.filter(c => c.bucket === 'gap').map(c => c.label)
  const generatedAt = new Date().toISOString()

  return { overall, criteria: criteriaOut, strong, gaps, generated_at: generatedAt }
}
