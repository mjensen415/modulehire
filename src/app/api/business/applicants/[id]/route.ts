import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgRole } from '@/lib/business/org-access'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: applicant, error: applicantError } = await supabase
      .from('applicants')
      .select('*')
      .eq('id', id)
      .single()
    if (applicantError || !applicant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const role = await getOrgRole(supabase, applicant.org_id, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [scoresRes, notesRes, historyRes] = await Promise.all([
      supabase
        .from('applicant_criterion_scores')
        .select('criterion_id, score, met, evidence, scoring_criteria ( label, weight )')
        .eq('applicant_id', id),
      supabase
        .from('applicant_notes')
        .select('id, body, user_id, created_at')
        .eq('applicant_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('applicant_status_history')
        .select('id, user_id, from_status, to_status, changed_at')
        .eq('applicant_id', id)
        .order('changed_at', { ascending: false }),
    ])

    if (scoresRes.error) throw scoresRes.error
    if (notesRes.error) throw notesRes.error
    if (historyRes.error) throw historyRes.error

    type ScoreRow = {
      criterion_id: string
      score: number | null
      met: boolean | null
      evidence: string | null
      scoring_criteria: { label: string; weight: string } | null
    }

    const criteriaScores = ((scoresRes.data ?? []) as unknown as ScoreRow[]).map((s) => ({
      criterion_id: s.criterion_id,
      label: s.scoring_criteria?.label ?? null,
      weight: s.scoring_criteria?.weight ?? null,
      score: s.score,
      met: s.met,
      evidence: s.evidence,
    }))

    return NextResponse.json({
      applicant: {
        ...applicant,
        criteria_scores: criteriaScores,
        notes: notesRes.data ?? [],
        history: historyRes.data ?? [],
      },
    })
  } catch (error) {
    console.error('[business/applicants/[id] GET]', error)
    return NextResponse.json({ error: 'Could not load applicant.' }, { status: 500 })
  }
}
