// Scores a JD's criteria against evidence (library modules for the match report, or the
// sections of an edited resume for the live editor's server fit). One shared prompt and formula,
// so both numbers are on the same scale.
import { aiCompleteJson } from '@/lib/ai'
import { isDimension, type JdCriterion } from '@/lib/dimensions'
import { shortlistScores } from '@/lib/shortlist'

const MAX_EVIDENCE = 60
const SNIPPET = 200

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
          label: { type: 'string', description: 'Exact label from the requirements list above' },
          score: { type: 'number', description: '0-100' },
          evidence_module_ids: { type: 'array', items: { type: 'string' }, description: 'Up to 3 evidence ids that best prove this requirement, or empty if none' },
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
  // Each piece of evidence is listed once — id, title, dimensions, first 200 characters — and
  // only if it's tagged with a criterion's dimension (or untagged), at most 60. Listing every
  // relevant module in full under every criterion is what sent one call to 86k input tokens.
  const dims = new Set(criteria.map(c => c.dimension))
  let modules = evidenceItems.filter(m => {
    const d = Array.isArray(m.dimensions) ? m.dimensions.filter(isDimension) : []
    return d.length === 0 || d.some(x => dims.has(x))
  })
  if (modules.length > MAX_EVIDENCE) {
    const relevance = shortlistScores({ extracted_criteria: criteria }, modules)
    modules = [...modules].sort((a, b) => (relevance.get(b.id) ?? 0) - (relevance.get(a.id) ?? 0)).slice(0, MAX_EVIDENCE)
  }
  const evidenceBlock = modules.length > 0
    ? modules.map(m => {
        const d = Array.isArray(m.dimensions) ? m.dimensions.filter(isDimension) : []
        return `- id: ${m.id} | ${m.title}${m.label ? ` (${m.label})` : ''}${d.length ? ` | ${d.join(', ')}` : ''} | ${String(m.content ?? '').replace(/\s+/g, ' ').slice(0, SNIPPET)}`
      }).join('\n')
    : '(no evidence)'
  const criteriaBlock = criteria.map((c, i) => `${i + 1}. "${c.label}" [${c.dimension}] weight ${c.weight}/5 — ${c.description}`).join('\n')

  const systemPrompt = `You are scoring how well a candidate's evidence satisfies each requirement of a job description, one requirement at a time. Be conservative — don't give credit for keyword overlap alone, only for real evidence.

Scoring guide:
- 85-100: direct, specific, recent evidence at the right level
- 60-84: clear evidence but at a lower level, less recent, or less specific
- 30-59: adjacent or partial evidence
- 0-29: nothing relevant in the evidence

For each requirement, pick up to 3 evidence ids that best prove it (fewer or none if the evidence is weak). "why" is max 15 words, plain English, second person.

Example:
EVIDENCE
- id: e1 | Enterprise onboarding | responsibility | Led onboarding for 40 enterprise accounts, cutting time to first value from 60 to 21 days.
- id: e2 | Support team lead | collaboration | Managed a team of three support reps and ran their weekly coaching.
REQUIREMENTS
1. "Enterprise onboarding" [responsibility] weight 5 — Owns onboarding for large B2B customers.
2. "People leadership" [collaboration] weight 3 — Has managed a team of 5 or more.
Result:
[{"label":"Enterprise onboarding","score":90,"evidence_module_ids":["e1"],"why":"You've run onboarding for dozens of enterprise accounts."},
 {"label":"People leadership","score":50,"evidence_module_ids":["e2"],"why":"You've led a team, but smaller than they're asking for."}]`

  const userPrompt = `JOB: ${jobLabel}

EVIDENCE
${evidenceBlock}

REQUIREMENTS
${criteriaBlock}

Score every requirement above and return one entry per requirement, using its exact label.`

  const call = (temperature?: number) => aiCompleteJson<{ criteria: CriterionResult[] }>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    RESULT_SCHEMA,
    2400,
    { tier: 'quality', userId: opts.userId, action: opts.action, ...(temperature !== undefined ? { temperature } : {}) }
  )
  // One retry at temperature 0 when any requirement comes back unscored; then take what we have.
  const scoredAll = (r: { criteria?: CriterionResult[] }) => {
    const labels = new Set((r.criteria ?? []).filter(c => typeof c?.score === 'number').map(c => c.label))
    return criteria.every(c => labels.has(c.label))
  }
  let aiResult = await call()
  if (!scoredAll(aiResult)) {
    try {
      const retry = await call(0)
      if ((retry.criteria?.length ?? 0) >= (aiResult.criteria?.length ?? 0)) aiResult = retry
    } catch (e) {
      console.error('[criteria-score] retry failed:', e)
    }
  }
  aiResult = { criteria: Array.isArray(aiResult.criteria) ? aiResult.criteria : [] }

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
