import { NextResponse } from 'next/server'
import { aiCompleteJson } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { checkAndLog } from '@/lib/rate-limit'
import { DIMENSIONS, sanitizeCriteria } from '@/lib/dimensions'

export const maxDuration = 120

const SYSTEM_PROMPT = `Extract structured data from a job description.

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
to pass ATS.

extracted_criteria: 5-9 typed, weighted requirements. Include exactly one "role" criterion and
exactly one "seniority" criterion; spread the rest across the other four dimensions (responsibility,
skill, domain, collaboration) based on what this specific JD actually emphasizes — do not force a
criterion for a dimension the JD barely touches. weight 5 = clearly a must-have, stated repeatedly
or up front; weight 1 = nice-to-have. Order the array by weight descending.`

const ANALYZE_JD_SCHEMA = {
  type: 'object',
  properties: {
    extracted_company: { type: 'string', description: 'Company name, or empty string if not found' },
    extracted_job_title: { type: 'string', description: "The literal job title as written in the JD (e.g. 'Head of People'). Empty string if none present." },
    extracted_role_type: { type: 'string' },
    extracted_themes: { type: 'array', items: { type: 'string' } },
    extracted_seniority: { type: 'string', enum: ['ic', 'manager', 'senior-manager', 'director', 'vp', 'c-suite'] },
    extracted_phrases: { type: 'array', items: { type: 'string' } },
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
  required: ['extracted_company', 'extracted_job_title', 'extracted_role_type', 'extracted_themes', 'extracted_seniority', 'extracted_phrases', 'extracted_criteria'],
}

type ExtractedJd = {
  extracted_company: string
  extracted_job_title: string
  extracted_role_type: string
  extracted_themes: string[]
  extracted_seniority: string
  extracted_phrases: string[]
  extracted_criteria: unknown
}

export async function POST(req: Request) {
  try {
    let supabase = await createClient()
    let { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      const authHeader = req.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7)
        const authedClient = createAnonClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        )
        const { data } = await authedClient.auth.getUser()
        user = data.user
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (user) supabase = authedClient as any
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limit = await checkAndLog(supabase, user.id, 'rl_analyze_jd', 30, 3600)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }

    const { raw_text } = await req.json()
    if (typeof raw_text !== 'string' || !raw_text) {
      return NextResponse.json({ error: 'Missing raw_text' }, { status: 400 })
    }
    if (raw_text.length > 50_000) {
      return NextResponse.json({ error: 'Job description too long (max 50,000 chars)' }, { status: 400 })
    }

    // Insert JD row first so we have an ID
    const { data: jdRow, error: insertError } = await supabase
      .from('job_descriptions')
      .insert({ user_id: user.id, raw_text, source_type: 'paste' })
      .select()
      .single()
    if (insertError) throw insertError

    const extracted = await aiCompleteJson<ExtractedJd>(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Job Description:\n${raw_text}` },
      ],
      ANALYZE_JD_SCHEMA,
      2048,
      { tier: 'quality', userId: user.id, action: 'analyze_jd' }
    )
    const criteria = sanitizeCriteria(extracted.extracted_criteria)

    const { data: updated, error: updateError } = await supabase
      .from('job_descriptions')
      .update({
        extracted_company: extracted.extracted_company,
        extracted_role_type: extracted.extracted_role_type,
        extracted_job_title: typeof extracted.extracted_job_title === 'string'
          ? extracted.extracted_job_title.trim().slice(0, 200)
          : null,
        extracted_themes: extracted.extracted_themes,
        extracted_seniority: extracted.extracted_seniority,
        extracted_phrases: extracted.extracted_phrases,
        extracted_criteria: criteria,
      })
      .eq('id', jdRow.id)
      .select()
      .single()
    if (updateError) throw updateError

    return NextResponse.json({
      jd_id: updated.id,
      extracted_company: updated.extracted_company,
      extracted_role_type: updated.extracted_role_type,
      extracted_job_title: updated.extracted_job_title,
      extracted_themes: updated.extracted_themes,
      extracted_seniority: updated.extracted_seniority,
      extracted_phrases: updated.extracted_phrases,
      extracted_criteria: updated.extracted_criteria,
    })
  } catch (error) {
    console.error('[analyze-jd]', error)
    return NextResponse.json({ error: 'Could not analyze job description.' }, { status: 500 })
  }
}
