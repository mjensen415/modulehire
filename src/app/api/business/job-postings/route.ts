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

    const prompt = `Extract structured data from this job description. Output MUST be a raw JSON object starting with { and ending with }. No other text.

Required keys:
{
  "extracted_company": "company name or empty string",
  "extracted_job_title": "literal job title",
  "extracted_role_type": "best match role type or 'other'",
  "extracted_themes": ["5-12 short skill or competency themes"],
  "extracted_seniority": "one of: ic, manager, senior-manager, director, vp, c-suite",
  "extracted_phrases": ["5-10 exact verbatim phrases a resume should echo"]
}

Job Description:
${rawJd}

JSON:`

    let job_extracted = job
    try {
      const raw = await aiComplete(
        [
          { role: 'user', content: prompt },
          { role: 'assistant', content: '{' },
        ],
        1024
      )
      const extracted = JSON.parse(jsonrepair('{' + raw))

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
