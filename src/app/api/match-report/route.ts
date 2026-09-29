import { NextResponse } from 'next/server'
import { aiCompleteJson } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid } from '@/lib/validate'
import { getActiveProfileId } from '@/lib/profile'
import { isDimension, type JdCriterion } from '@/lib/dimensions'

export const maxDuration = 120

type CriterionResult = { label: string; score: number; evidence_module_ids: string[]; why: string }

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

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const limit = await checkAndLog(supabase, user.id, 'rl_match_report', 60, 3600)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }

    const { jd_id } = await req.json()
    if (!isUuid(jd_id)) {
      return NextResponse.json({ error: 'Invalid jd_id' }, { status: 400 })
    }

    const { data: jd, error: jdError } = await supabase
      .from('job_descriptions')
      .select('id, extracted_company, extracted_job_title, extracted_role_type, extracted_criteria, match_report, match_report_at, match_report_profile_id, updated_at, source_url')
      .eq('id', jd_id)
      .eq('user_id', user.id)
      .single()
    if (jdError || !jd) return NextResponse.json({ error: 'Job description not found' }, { status: 404 })

    const criteria = (Array.isArray(jd.extracted_criteria) ? jd.extracted_criteria : []) as JdCriterion[]
    if (criteria.length === 0) {
      return NextResponse.json({ error: 'This job description has no extracted criteria yet — analyze it first.' }, { status: 400 })
    }

    const profileId = await getActiveProfileId(supabase, user.id)

    const { data: modules, error: modError } = await supabase
      .from('modules')
      .select('id, title, content, dimensions, weight, source_company, source_role_title, updated_at')
      .eq('user_id', user.id)
      .eq('profile_id', profileId)
      .is('deleted_at', null)
    if (modError) throw modError

    // Cache: reuse a saved report when it was generated for this profile, after the JD was
    // last edited (criteria weight/removal edits invalidate it), and after every module's
    // last edit (a newly added/edited module could change the evidence).
    const newestModuleUpdate = (modules ?? []).reduce((max, m) => (m.updated_at > max ? m.updated_at : max), '1970-01-01T00:00:00Z')
    if (
      jd.match_report &&
      jd.match_report_profile_id === profileId &&
      jd.match_report_at &&
      jd.match_report_at > jd.updated_at &&
      jd.match_report_at > newestModuleUpdate
    ) {
      return NextResponse.json(jd.match_report)
    }

    const criteriaBlock = criteria.map((c, i) => {
      // Untagged modules (pre-backfill) are shown for every criterion so nothing is silently
      // excluded; tagged modules are shown only for their matching dimension to keep the prompt small.
      const relevant = (modules ?? []).filter(m => {
        const dims = Array.isArray(m.dimensions) ? m.dimensions.filter(isDimension) : []
        return dims.length === 0 || dims.includes(c.dimension)
      })
      const moduleLines = relevant.length > 0
        ? relevant.map(m =>
            `  - id: ${m.id} | title: ${m.title} | ${m.source_company ?? ''}${m.source_role_title ? ` (${m.source_role_title})` : ''}\n    content: ${String(m.content ?? '').slice(0, 600)}`
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

    const userPrompt = `JOB: ${jd.extracted_job_title ?? jd.extracted_role_type ?? 'this role'}${jd.extracted_company ? ` at ${jd.extracted_company}` : ''}

${criteriaBlock}

Score every criterion listed above and return one entry per criterion, using its exact label.`

    const aiResult = await aiCompleteJson<{ criteria: CriterionResult[] }>(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      RESULT_SCHEMA,
      4096,
      { tier: 'quality', userId: user.id, action: 'match_report' }
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
          return { id: m.id, title: m.title, source_company: m.source_company }
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

    const report = { overall, criteria: criteriaOut, strong, gaps, generated_at: generatedAt }

    const { error: updateError } = await supabase
      .from('job_descriptions')
      .update({ match_report: report, match_report_at: generatedAt, match_report_profile_id: profileId })
      .eq('id', jd_id)
    if (updateError) console.error('[match-report] save failed:', updateError)

    return NextResponse.json(report)
  } catch (error) {
    console.error('[match-report]', error)
    return NextResponse.json({ error: 'Could not generate match report.' }, { status: 500 })
  }
}
