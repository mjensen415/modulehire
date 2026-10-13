import type { SupabaseClient } from '@supabase/supabase-js'
import { aiCompleteJson } from '@/lib/ai'
import { isDegreeWaivable } from '@/lib/jd-signal'

type Criterion = { id: string; label: string; weight: string; description: string | null; criterion_type?: string; min_years?: number | null }

type ScoreResult = {
  candidate_name: string | null
  parsed_headline: string
  overall_score: number
  has_dealbreaker: boolean
  criteria_scores: Array<{ criterion_id: string; score: number; met: boolean; evidence: string }>
}

const SCORE_SCHEMA = {
  type: 'object',
  properties: {
    candidate_name: { type: 'string', description: 'Full name of the candidate as it appears in the resume, or empty string if not found' },
    parsed_headline: { type: 'string', description: "One sentence describing this candidate's background, max 15 words" },
    overall_score: { type: 'number', description: '0-100 weighted composite: dealbreakers 3x weight, must_have 2x, nice_to_have 1x. If any dealbreaker has met: false, cap at 25.' },
    has_dealbreaker: { type: 'boolean', description: 'True if any dealbreaker criterion has met: false' },
    criteria_scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion_id: { type: 'string', description: 'Exact criterion_id from the list' },
          score: { type: 'number', description: '0-100' },
          met: { type: 'boolean' },
          evidence: { type: 'string', description: 'Quote exact resume text supporting the score, max 120 chars, or "not found in resume"' },
        },
        required: ['criterion_id', 'score', 'met', 'evidence'],
      },
    },
  },
  required: ['candidate_name', 'parsed_headline', 'overall_score', 'has_dealbreaker', 'criteria_scores'],
}

const EDUCATION_RE = /\b(degree|bachelor'?s?|master'?s|ph\.?d|mba|diploma|education)\b/i

function isEducationCriterion(c: Criterion): boolean {
  return EDUCATION_RE.test(`${c.label} ${c.description ?? ''}`)
}

export async function scoreApplicant(params: {
  applicantId: string
  applicantName: string | null
  rawText: string
  jobTitle: string
  jobCompany: string | null
  themes: string[]
  phrases: string[]
  /** job_postings.degree_requirement — when waivable, education never counts as a dealbreaker. */
  degreeRequirement?: unknown
  criteria: Criterion[]
  supabase: SupabaseClient
}): Promise<void> {
  const { applicantId, applicantName, rawText, jobTitle, jobCompany, themes, phrases, degreeRequirement, criteria, supabase } = params
  const degreeWaivable = isDegreeWaivable(degreeRequirement)
  const educationCriterionIds = new Set(criteria.filter(isEducationCriterion).map(c => c.id))

  const systemPrompt = `You are evaluating a job applicant's resume against specific hiring criteria.

SCORING RULES:
- For EXPERIENCE criteria: estimate how many years the candidate has in this area. score = min(actual_years / min_years, 1) * 100 (capped at 100). met: true if actual_years >= min_years (or no minimum set). met: false if clearly below threshold.
- For SKILL criteria: score = confidence the skill is present or demonstrated (0-100). met: true if clearly present, false if absent.
- Reasons are shown to the user, so evidence should quote exact resume text supporting the score.${degreeWaivable ? `
- DEGREE IS WAIVABLE: this posting accepts equivalent experience in place of a degree (or lists the degree as preferred only). For any education/degree criterion, score it as experience-substitutable: a candidate without the degree but with comparable relevant experience should score well and be met: true. Never treat an education/degree criterion as a dealbreaker, and never cap the overall score because of one.` : ''}`

  const userPrompt = `JOB: ${jobTitle}${jobCompany ? ` at ${jobCompany}` : ''}
KEY THEMES: ${themes.join(', ')}
KEY PHRASES TO LOOK FOR: ${phrases.join(', ')}

SCORING CRITERIA (use exact criterion_id values in your response):
${criteria.map((c, i) => {
  const isExp = c.criterion_type === 'experience'
  const typeTag = isExp ? `[EXPERIENCE${c.min_years ? ` - min ${c.min_years} yrs` : ''}]` : '[SKILL]'
  return `${i + 1}. [${c.weight.toUpperCase()}] ${typeTag} ${c.label}${c.description ? `: ${c.description}` : ''}
   criterion_id: ${c.id}`
}).join('\n')}

CANDIDATE RESUME:
${rawText.slice(0, 8000)}`

  const parsed = await aiCompleteJson<ScoreResult>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    SCORE_SCHEMA,
    1200,
    { tier: 'quality', action: 'ai_biz_score' }
  )

  // Enforce the waivable-degree rule server-side too: a failed education criterion alone can't
  // trip the dealbreaker flag.
  if (degreeWaivable && parsed.has_dealbreaker) {
    const failedDealbreakers = criteria.filter(c =>
      c.weight === 'dealbreaker' &&
      (parsed.criteria_scores ?? []).some(cs => cs.criterion_id === c.id && cs.met === false)
    )
    if (failedDealbreakers.length > 0 && failedDealbreakers.every(c => educationCriterionIds.has(c.id))) {
      parsed.has_dealbreaker = false
    }
  }

  const nameUpdate = !applicantName && parsed.candidate_name?.trim()
    ? { name: parsed.candidate_name.trim().slice(0, 200) }
    : {}

  const { error: applicantError } = await supabase
    .from('applicants')
    .update({
      ...nameUpdate,
      parsed_headline: parsed.parsed_headline ?? null,
      overall_score: typeof parsed.overall_score === 'number' ? parsed.overall_score : null,
      has_dealbreaker: !!parsed.has_dealbreaker,
      scored_at: new Date().toISOString(),
    })
    .eq('id', applicantId)
  if (applicantError) throw applicantError

  const criterionIds = new Set(criteria.map((c) => c.id))
  const rows = (parsed.criteria_scores ?? [])
    .filter((cs) => typeof cs.criterion_id === 'string' && criterionIds.has(cs.criterion_id))
    .map((cs) => ({
      applicant_id: applicantId,
      criterion_id: cs.criterion_id,
      score: typeof cs.score === 'number' ? cs.score : null,
      met: typeof cs.met === 'boolean' ? cs.met : null,
      evidence: typeof cs.evidence === 'string' ? cs.evidence.slice(0, 200) : null,
    }))

  if (rows.length > 0) {
    const { error: scoresError } = await supabase
      .from('applicant_criterion_scores')
      .upsert(rows, { onConflict: 'applicant_id,criterion_id' })
    if (scoresError) throw scoresError
  }
}
