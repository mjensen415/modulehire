import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requiredString, isUuid } from '@/lib/validate'
import { aiComplete } from '@/lib/ai'
import { jsonrepair } from 'jsonrepair'
import { getOrgRole } from '@/lib/business/org-access'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const orgId = body.org_id
    if (!isUuid(orgId)) return NextResponse.json({ error: 'Invalid org_id' }, { status: 400 })

    const title = requiredString(body.title, 200, 'title')
    const rawJd = requiredString(body.raw_jd, 50_000, 'raw_jd')

    const role = await getOrgRole(supabase, orgId, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: job, error: insertError } = await supabase
      .from('job_postings')
      .insert({ org_id: orgId, title, raw_jd: rawJd, created_by: user.id })
      .select()
      .single()
    if (insertError) throw insertError

    const prompt = `Extract structured data from this job description and return ONLY a valid JSON object — no explanation, no markdown, no code fences.

{
  "extracted_company": "company name, or empty string if not found",
  "extracted_job_title": "the literal job title as written",
  "extracted_role_type": "one of: vp-community, head-of-community, director-community, senior-manager-community, community-manager, developer-relations, developer-advocacy, developer-community-manager, community-marketing, community-ops, community-enablement, content-strategy, ic-community, software-engineer, product-manager, designer, data-scientist, marketing-manager, sales, operations, finance, hr, other",
  "extracted_themes": ["6 to 12 short skill or competency phrases this role genuinely requires — e.g. 'cross-functional collaboration', 'SQL and data analysis', 'team leadership', 'product strategy'. Extract every distinct competency the JD calls for; do not invent themes not implied by the text."],
  "extracted_seniority": "one of: ic, manager, senior-manager, director, vp, c-suite",
  "extracted_phrases": ["5 to 10 exact verbatim phrases from the job description that a strong resume should echo to pass ATS screening"]
}

Job Description:
${rawJd}`

    let job_extracted = job
    let extractionFailed = false
    try {
      const raw = await aiComplete(
        [{ role: 'user', content: prompt }],
        1500
      )
      // Strip markdown fences if the model added them despite instructions
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      const jsonStr = cleaned.startsWith('{') ? cleaned : cleaned.slice(cleaned.indexOf('{'))
      const extracted = JSON.parse(jsonrepair(jsonStr))

      const { data: updated, error: updateError } = await supabase
        .from('job_postings')
        .update({
          extracted_company: extracted.extracted_company ?? null,
          extracted_job_title: extracted.extracted_job_title ?? null,
          extracted_role_type: extracted.extracted_role_type ?? null,
          extracted_themes: Array.isArray(extracted.extracted_themes) ? extracted.extracted_themes : [],
          extracted_seniority: extracted.extracted_seniority ?? null,
          extracted_phrases: Array.isArray(extracted.extracted_phrases) ? extracted.extracted_phrases : [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)
        .select()
        .single()
      if (updateError) throw updateError
      job_extracted = updated
    } catch (analyzeError) {
      // JD analysis is best-effort — keep the job posting even if extraction fails
      extractionFailed = true
      console.error('[business/job-postings analyze]', analyzeError)
    }

    return NextResponse.json({
      job: {
        id: job_extracted.id,
        org_id: job_extracted.org_id,
        title: job_extracted.title,
        status: job_extracted.status,
        extracted_themes: job_extracted.extracted_themes,
        extracted_phrases: job_extracted.extracted_phrases,
        extracted_seniority: job_extracted.extracted_seniority,
        extracted_role_type: job_extracted.extracted_role_type,
        extracted_company: job_extracted.extracted_company,
        created_at: job_extracted.created_at,
        extraction_failed: extractionFailed,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'ValidationError') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[business/job-postings POST]', error)
    return NextResponse.json({ error: 'Could not create job posting.' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgId = new URL(req.url).searchParams.get('org_id')
    if (!isUuid(orgId)) return NextResponse.json({ error: 'Invalid org_id' }, { status: 400 })

    const role = await getOrgRole(supabase, orgId, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: jobs, error } = await supabase
      .from('job_postings')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    if (error) throw error

    return NextResponse.json({ jobs: jobs ?? [] })
  } catch (error) {
    console.error('[business/job-postings GET]', error)
    return NextResponse.json({ error: 'Could not load job postings.' }, { status: 500 })
  }
}
