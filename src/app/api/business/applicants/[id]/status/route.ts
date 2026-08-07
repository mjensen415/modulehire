import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgRole } from '@/lib/business/org-access'

const STATUSES = new Set(['new', 'reviewing', 'shortlisted', 'interviewing', 'offered', 'rejected'])

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    if (!STATUSES.has(body.status)) {
      return NextResponse.json({ error: `status must be one of: ${[...STATUSES].join(', ')}` }, { status: 400 })
    }

    const { data: applicant, error: applicantError } = await supabase
      .from('applicants')
      .select('org_id, status')
      .eq('id', id)
      .single()
    if (applicantError || !applicant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const role = await getOrgRole(supabase, applicant.org_id, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: updated, error: updateError } = await supabase
      .from('applicants')
      .update({ status: body.status })
      .eq('id', id)
      .select('status')
      .single()
    if (updateError) throw updateError

    const changedAt = new Date().toISOString()
    const { error: historyError } = await supabase
      .from('applicant_status_history')
      .insert({
        applicant_id: id,
        user_id: user.id,
        from_status: applicant.status,
        to_status: body.status,
        changed_at: changedAt,
      })
    if (historyError) throw historyError

    return NextResponse.json({ status: updated.status, changed_at: changedAt })
  } catch (error) {
    console.error('[business/applicants/[id]/status PATCH]', error)
    return NextResponse.json({ error: 'Could not update status.' }, { status: 500 })
  }
}
