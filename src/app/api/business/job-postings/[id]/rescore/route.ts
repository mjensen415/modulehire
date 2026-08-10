import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgRole } from '@/lib/business/org-access'
import { scoreApplicant } from '@/lib/business/score-applicant'

export const maxDuration = 120

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: jobId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: job, error: jobError } = await supabase
      .from('job_postings')
      .select('org_id, title, extracted_company, extracted_themes, extracted_phrases')
      .eq('id', jobId)
      .single()
    if (jobError || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const role = await getOrgRole(supabase, job.org_id, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: criteria, error: criteriaError } = await supabase
      .from('scoring_criteria')
      .select('id, label, weight, description')
      .eq('job_id', jobId)
      .order('sort_order', { ascending: true })
    if (criteriaError) throw criteriaError

    const { data: applicants, error: applicantsError } = await supabase
      .from('applicants')
      .select('id, raw_text')
      .eq('job_id', jobId)
      .not('raw_text', 'is', null)
    if (applicantsError) throw applicantsError

    let rescored = 0
    let errors = 0

    for (const applicant of applicants ?? []) {
      if (!applicant.raw_text) continue
      try {
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
        rescored += 1
      } catch (rescoreError) {
        console.error(`[business/job-postings/[id]/rescore applicant ${applicant.id}]`, rescoreError)
        errors += 1
      }
    }

    return NextResponse.json({ rescored, errors })
  } catch (error) {
    console.error('[business/job-postings/[id]/rescore POST]', error)
    return NextResponse.json({ error: 'Could not rescore applicants.' }, { status: 500 })
  }
}
