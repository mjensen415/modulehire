// The JD criteria pass: typed, weighted requirements with their repetition signal. Shared by
// /api/analyze-jd and the eval suite (scripts/eval).
import { aiCompleteJson } from './ai'
import { DIMENSIONS, sanitizeCriteria, type JdCriterion } from './dimensions'
import { CRITERIA_REPETITION_PROMPT, CRITERIA_REPETITION_SCHEMA_PROPS, CRITERIA_WORKED_EXAMPLE, applyMentionWeightRule } from './jd-signal'

export const SYSTEM_PROMPT_CRITERIA = `Extract typed, weighted hiring criteria from a job description.

extracted_criteria: 5-9 typed, weighted requirements. Include exactly one "role" criterion and
exactly one "seniority" criterion; spread the rest across the other four dimensions (responsibility,
skill, domain, collaboration) based on what this specific JD actually emphasizes — do not force a
criterion for a dimension the JD barely touches. weight 5 = clearly a must-have, stated repeatedly
or up front; weight 1 = nice-to-have. Order the array by weight descending.

${CRITERIA_REPETITION_PROMPT}

${CRITERIA_WORKED_EXAMPLE}`

export const CRITERIA_SCHEMA = {
  type: 'object',
  properties: {
    extracted_criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: "Short criterion name, 2-5 words (e.g. 'Community Executive Leadership')" },
          dimension: { type: 'string', enum: DIMENSIONS as unknown as string[] },
          weight: { type: 'number', description: '1-5' },
          description: { type: 'string', description: 'One sentence: what the JD actually asks for, in plain English' },
          ...CRITERIA_REPETITION_SCHEMA_PROPS,
        },
        required: ['label', 'dimension', 'weight', 'description', 'mentions', 'also_called'],
      },
    },
  },
  required: ['extracted_criteria'],
}

/**
 * Extracts criteria from a posting. Fewer than 3 usable criteria is a bad extraction: retry
 * once at temperature 0 and keep the better result.
 */
export async function extractJdCriteria(rawText: string, opts: { userId?: string; action?: string } = {}): Promise<JdCriterion[]> {
  const run = (temperature?: number) => aiCompleteJson<{ extracted_criteria: unknown }>(
    [
      { role: 'system', content: SYSTEM_PROMPT_CRITERIA },
      { role: 'user', content: `Job Description:\n${rawText}` },
    ],
    CRITERIA_SCHEMA,
    1600,
    { tier: 'quality', userId: opts.userId, action: opts.action, ...(temperature !== undefined ? { temperature } : {}) }
  ).then(raw => applyMentionWeightRule(sanitizeCriteria(raw.extracted_criteria)))
  const first = await run()
  if (first.length >= 3) return first
  try {
    const second = await run(0)
    return second.length > first.length ? second : first
  } catch {
    return first
  }
}
