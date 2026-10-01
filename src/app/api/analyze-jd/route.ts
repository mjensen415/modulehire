import { NextResponse } from 'next/server'
import { aiCompleteJson } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { checkAndLog } from '@/lib/rate-limit'
import { DIMENSIONS, sanitizeCriteria } from '@/lib/dimensions'
import { createHash } from 'crypto'

export const maxDuration = 120

const SYSTEM_PROMPT_BASICS = `Extract basic structured data from a job description.

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

const SYSTEM_PROMPT_CRITERIA = `Extract typed, weighted hiring criteria from a job description.

extracted_criteria: 5-9 typed, weighted requirements. Include exactly one "role" criterion and
exactly one "seniority" criterion; spread the rest across the other four dimensions (responsibility,
skill, domain, collaboration) based on what this specific JD actually emphasizes — do not force a
criterion for a dimension the JD barely touches. weight 5 = clearly a must-have, stated repeatedly
or up front; weight 1 = nice-to-have. Order the array by weight descending.`

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

type Basics = {
  extracted_company: string
  extracted_job_title: string
  extracted_role_type: string
  extracted_themes: string[]
  extracted_seniority: string
  extracted_phrases: string[]
}

function ndjsonLine(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + '\n')
}

export async function POST(req: Request) {
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

  const trimmed = raw_text.trim()
  const hash = createHash('sha256').update(trimmed).digest('hex')

  // Already analyzed this exact text for this user — stream the cached result back
  // instead of calling the AI again.
  const { data: existing } = await supabase
    .from('job_descriptions')
    .select('*')
    .eq('user_id', user.id)
    .eq('raw_text_hash', hash)
    .is('deleted_at', null)
    .not('extracted_criteria', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const stream = new ReadableStream({
    async start(controller) {
      if (existing) {
        controller.enqueue(ndjsonLine({
          type: 'basics',
          jd_id: existing.id,
          extracted_company: existing.extracted_company,
          extracted_job_title: existing.extracted_job_title,
          extracted_role_type: existing.extracted_role_type,
          extracted_seniority: existing.extracted_seniority,
          extracted_themes: existing.extracted_themes,
          extracted_phrases: existing.extracted_phrases,
        }))
        controller.enqueue(ndjsonLine({ type: 'criteria', extracted_criteria: existing.extracted_criteria }))
        controller.enqueue(ndjsonLine({ type: 'done' }))
        controller.close()
        return
      }

      const { data: jdRow, error: insertError } = await supabase
        .from('job_descriptions')
        .insert({ user_id: user!.id, raw_text, source_type: 'paste', raw_text_hash: hash })
        .select()
        .single()

      if (insertError || !jdRow) {
        console.error('[analyze-jd] insert failed:', insertError)
        controller.enqueue(ndjsonLine({ type: 'error', stage: 'basics' }))
        controller.enqueue(ndjsonLine({ type: 'done' }))
        controller.close()
        return
      }

      const basicsPromise = aiCompleteJson<Basics>(
        [
          { role: 'system', content: SYSTEM_PROMPT_BASICS },
          { role: 'user', content: `Job Description:\n${raw_text}` },
        ],
        BASICS_SCHEMA,
        1024,
        { tier: 'fast', userId: user!.id, action: 'analyze_jd' }
      )
        .then(async (basics) => {
          const jobTitle = typeof basics.extracted_job_title === 'string' ? basics.extracted_job_title.trim().slice(0, 200) : ''
          await supabase
            .from('job_descriptions')
            .update({
              extracted_company: basics.extracted_company,
              extracted_role_type: basics.extracted_role_type,
              extracted_job_title: jobTitle || null,
              extracted_themes: basics.extracted_themes,
              extracted_seniority: basics.extracted_seniority,
              extracted_phrases: basics.extracted_phrases,
            })
            .eq('id', jdRow.id)
          controller.enqueue(ndjsonLine({
            type: 'basics',
            jd_id: jdRow.id,
            extracted_company: basics.extracted_company,
            extracted_job_title: jobTitle,
            extracted_role_type: basics.extracted_role_type,
            extracted_seniority: basics.extracted_seniority,
            extracted_themes: basics.extracted_themes,
            extracted_phrases: basics.extracted_phrases,
          }))
        })
        .catch((err) => {
          console.error('[analyze-jd] basics pass failed:', err)
          controller.enqueue(ndjsonLine({ type: 'error', stage: 'basics' }))
        })

      const criteriaPromise = aiCompleteJson<{ extracted_criteria: unknown }>(
        [
          { role: 'system', content: SYSTEM_PROMPT_CRITERIA },
          { role: 'user', content: `Job Description:\n${raw_text}` },
        ],
        CRITERIA_SCHEMA,
        1536,
        { tier: 'quality', userId: user!.id, action: 'analyze_jd' }
      )
        .then(async (raw) => {
          const criteria = sanitizeCriteria(raw.extracted_criteria)
          await supabase.from('job_descriptions').update({ extracted_criteria: criteria }).eq('id', jdRow.id)
          controller.enqueue(ndjsonLine({ type: 'criteria', extracted_criteria: criteria }))
        })
        .catch((err) => {
          console.error('[analyze-jd] criteria pass failed:', err)
          controller.enqueue(ndjsonLine({ type: 'error', stage: 'criteria' }))
        })

      await Promise.allSettled([basicsPromise, criteriaPromise])
      controller.enqueue(ndjsonLine({ type: 'done' }))
      controller.close()
    },
  })

  return new NextResponse(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  })
}
