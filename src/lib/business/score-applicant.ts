import type { SupabaseClient } from '@supabase/supabase-js'
import { jsonrepair } from 'jsonrepair'
import { aiComplete } from '@/lib/ai'

type Criterion = { id: string; label: string; weight: string; description: string | null; criterion_type?: string; min_years?: number | null }

export async function scoreApplicant(params: {
  applicantId: string
  rawText: string
  jobTitle: string
  jobCompany: string | null
  themes: string[]
  phrases: string[]
  criteria: Criterion[]
  supabase: SupabaseClient
}): Promise<void> {
  const { applicantId, rawText, jobTitle, jobCompany, themes, phrases, criteria, supabase } = params

  const prompt = `You are evaluating a job applicant's resume against specific hiring criteria.

JOB: ${jobTitle}${jobCompany ? ` at ${jobCompany}` : ''}
KEY THEMES: ${themes.join(', ')}
KEY PHRASES TO LOOK FOR: ${phrases.join(', ')}

SCORING CRITERIA:
${criteria.map((c, i) => {
  const isExp = c.criterion_type === 'experience'
  const typeTag = isExp ? `[EXPERIENCE${c.min_years ? ` - min ${c.min_years} yrs` : ''}]` : '[SKILL]'
  return `${i + 1}. [${c.weight.toUpperCase()}] ${typeTag} ${c.label}${c.description ? `: ${c.description}` : ''}`
}).join('\n')}

CANDIDATE RESUME:
${rawText.slice(0, 8000)}

SCORING RULES:
- For EXPERIENCE criteria: estimate how many years of experience the candidate has in this area. score = min(actual_years / min_years, 1) * 100 (capped at 100). met: true if actual_years >= min_years (or min_years is 0). If no minimum specified, met: true if any relevant experience is found.
- For SKILL criteria: score = confidence the skill/technology is present or demonstrated (0-100). met: true if clearly present, false if absent.
- For DEALBREAKER criteria: explicitly set met: true/false
- evidence: quote the exact resume text that supports the score, max 120 chars. If nothing found, write "not found in resume"
- overall_score: weighted composite. Dealbreakers = 3x weight. must_have = 2x. nice_to_have = 1x. If any dealbreaker has met: false, cap overall_score at 25.
- parsed_headline: one sentence describing this candidate's background (max 15 words)
- has_dealbreaker: true if any dealbreaker criterion has met: false

Return only raw JSON:
{
  "parsed_headline": "...",
  "overall_score": 0-100,
  "has_dealbreaker": false,
  "criteria_scores": [
    {
      "criterion_id": "<id from criteria list above>",
      "score": 0-100,
      "met": true,
      "evidence": "..."
    }
  ]
}`

  const raw = await aiComplete(
    [
      { role: 'user', content: prompt },
      { role: 'assistant', content: '{' },
    ],
    1200
  )
  const parsed = JSON.parse(jsonrepair('{' + raw)) as {
    parsed_headline?: string
    overall_score?: number
    has_dealbreaker?: boolean
    criteria_scores?: Array<{ criterion_id?: string; score?: number; met?: boolean; evidence?: string }>
  }

  const { error: applicantError } = await supabase
    .from('applicants')
    .update({
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
      criterion_id: cs.criterion_id as string,
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
