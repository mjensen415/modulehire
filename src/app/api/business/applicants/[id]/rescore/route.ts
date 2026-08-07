import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgRole } from '@/lib/business/org-access'
import { scoreApplicant } from '@/lib/business/score-applicant'

export const maxDuration = 60

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: applicant, error: applicantError } = await supabase
      .from('applicants')
      .select('id, org_id, job_id, raw_text')
      .eq('id', id)
      .single()
    if (applicantError || !applicant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const role = await getOrgRole(supabase, applicant.org_id, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!applicant.raw_text) {
      return NextResponse.json({ error: 'Applicant has no resume text to score' }, { status: 400 })
    }

    const { data: job, error: jobError } = await supabase
      .from('job_postings')
      .select('title, extracted_company, extracted_themes, extracted_phrases')
      .eq('id', applicant.job_id)
      .single()
    if (jobError || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const { data: criteria, error: criteriaError } = await supabase
      .from('scoring_criteria')
      .select('id, label, weight, description')
      .eq('job_id', applicant.job_id)
      .order('sort_order', { ascending: true })
    if (criteriaError) throw criteriaError

    await scoreApplicant({
      applicantId: applicant.id,
      rawText: applicant.raw_text,
      jobTitle: job.title,
      jobCompany: job.extracted_company ?? null,
      themes: job.extracted_themes ?? [],
      phrases: job.extracted_phrases ?? [],
      criteria: criteria ?? [],
      supabase,
    })

    const { data: updated, error: updatedError } = await supabase
      .from('applicants')
      .select('overall_score, has_dealbreaker, scored_at')
      .eq('id', id)
      .single()
    if (updatedError) throw updatedError

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[business/applicants/[id]/rescore POST]', error)
    return NextResponse.json({ error: 'Could not rescore applicant.' }, { status: 500 })
  }
}
