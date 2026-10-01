import { NextResponse } from 'next/server'
import { aiCompleteJson, resolveModel } from '@/lib/ai'
import { requireAdmin } from '@/lib/admin-guard'
import { DIMENSIONS, sanitizeCriteria } from '@/lib/dimensions'

export const maxDuration = 120

// Mirrors the two-pass split in production (src/app/api/analyze-jd/route.ts): a fast pass for
// basics and a deep pass for criteria, run in parallel. Kept non-streaming here — the lab shows
// one finished result, not a live build.
export const DEFAULT_BASICS_PROMPT = `Extract basic structured data from a job description.

extracted_role_type: identify the role type from the overall nature of the work and
responsibilities described — not by matching keywords in the title. A "Data Analyst" role doing
SQL, dashboards, and reporting is "data-scientist" ONLY if the role genuinely requires ML/modeling.
If the role is fundamentally analytical/BI work, use "operations" or "other". Best match from:
vp-community, head-of-community, director-community, senior-manager-community, community-manager,
developer-relations, developer-advocacy, developer-community-manager, community-marketing,
community-ops, community-enablement, content-strategy, ic-community, software-engineer,
product-manager, designer, data-scientist, marketing-manager, sales, operations, finance, hr, other

extracted_themes: 5-12 short skill or competency themes this role requires — plain English phrases
like "cross-functional collaboration", "data analysis", "team leadership". Extract every distinct
competency the role genuinely requires; do not invent themes not implied by the JD, but do not drop
real requirements to stay under a count. Reflect the actual requirements of THIS job description,
not a predefined list.

extracted_seniority: infer from required years of experience, scope of responsibilities, and
whether the role manages people or budget — not from words like "senior" or "manager" appearing in
requirements. A job requiring 2-4 years with no direct reports is "ic".

extracted_phrases: 5-10 exact verbatim phrases from the job description that a resume should echo
to pass ATS.`

export const DEFAULT_CRITERIA_PROMPT = `Extract typed, weighted hiring criteria from a job description.

extracted_criteria: 5-9 typed, weighted requirements (dimensions: ${DIMENSIONS.join(', ')}).
Include exactly one "role" criterion and exactly one "seniority" criterion; spread the rest across
the other four dimensions based on what this specific JD actually emphasizes — do not force a
criterion for a dimension the JD barely touches. weight 5 = clearly a must-have, stated repeatedly
or up front; weight 1 = nice-to-have. Order the array by weight descending.`

const BASICS_SCHEMA = {
  type: 'object',
  properties: {
    extracted_company: { type: 'string', description: 'Company name, or empty string if not found' },
    extracted_job_title: { type: 'string', description: "The literal job title as written in the JD (e.g. 'Head of People'). Empty string if none present." },
    extracted_role_type: { type: 'string' },
    extracted_themes: { type: 'array', items: { type: 'string' } },
    extracted_seniority: { type: 'string', enum: ['ic', 'manager', 'senior-manager', 'director', 'vp', 'c-suite'] },
    extracted_phrases: { type: 'array', items: { type: 'string' } },
  },
  required: ['extracted_company', 'extracted_job_title', 'extracted_role_type', 'extracted_themes', 'extracted_seniority', 'extracted_phrases'],
}

const CRITERIA_SCHEMA = {
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
        },
        required: ['label', 'dimension', 'weight', 'description'],
      },
    },
  },
  required: ['extracted_criteria'],
}

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error

  try {
    const { raw_text, prompt_override, model } = await req.json()
    if (typeof raw_text !== 'string' || !raw_text) {
      return NextResponse.json({ error: 'Missing raw_text' }, { status: 400 })
    }
    if (raw_text.length > 50_000) {
      return NextResponse.json({ error: 'Job description too long (max 50,000 chars)' }, { status: 400 })
    }

    // A prompt override replaces BOTH passes' instructions (one editable box in the lab UI,
    // same as production's split just collapsed for testing convenience).
    const isOverride = typeof prompt_override === 'string' && prompt_override.trim().length > 0
    const basicsSystem = isOverride ? prompt_override : DEFAULT_BASICS_PROMPT
    const criteriaSystem = isOverride ? prompt_override : DEFAULT_CRITERIA_PROMPT
    const promptUsed = `${basicsSystem}\n\n---\n\n${criteriaSystem}\n\nJob Description:\n${raw_text}`

    const [basicsResult, criteriaResult] = await Promise.all([
      aiCompleteJson<Record<string, unknown>>(
        [
          { role: 'system', content: basicsSystem },
          { role: 'user', content: `Job Description:\n${raw_text}` },
        ],
        BASICS_SCHEMA,
        1024,
        { model: typeof model === 'string' ? model : undefined, tier: 'fast' }
      ),
      aiCompleteJson<{ extracted_criteria: unknown }>(
        [
          { role: 'system', content: criteriaSystem },
          { role: 'user', content: `Job Description:\n${raw_text}` },
        ],
        CRITERIA_SCHEMA,
        1536,
        { model: typeof model === 'string' ? model : undefined, tier: 'quality' }
      ),
    ])

    const extracted = {
      ...basicsResult,
      extracted_criteria: sanitizeCriteria(criteriaResult.extracted_criteria),
    }

    return NextResponse.json({
      extracted,
      raw_ai_response: JSON.stringify(extracted, null, 2),
      prompt_used: promptUsed,
      model_used: model || resolveModel('quality'),
    })
  } catch (error) {
    console.error('[admin/prompt-lab/jd-parse]', error)
    return NextResponse.json({ error: 'Could not analyze job description.' }, { status: 500 })
  }
}
