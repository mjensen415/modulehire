import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requiredString } from '@/lib/validate'
import { getOrgRole } from '@/lib/business/org-access'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const noteBody = requiredString(body.body, 2000, 'body')

    const { data: applicant, error: applicantError } = await supabase
      .from('applicants')
      .select('org_id')
      .eq('id', id)
      .single()
    if (applicantError || !applicant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const role = await getOrgRole(supabase, applicant.org_id, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: note, error: insertError } = await supabase
      .from('applicant_notes')
      .insert({ applicant_id: id, user_id: user.id, body: noteBody })
      .select('id, body, user_id, created_at')
      .single()
    if (insertError) throw insertError

    return NextResponse.json({ note })
  } catch (error) {
    if (error instanceof Error && error.name === 'ValidationError') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[business/applicants/[id]/notes POST]', error)
    return NextResponse.json({ error: 'Could not add note.' }, { status: 500 })
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: applicant, error: applicantError } = await supabase
      .from('applicants')
      .select('org_id')
      .eq('id', id)
      .single()
    if (applicantError || !applicant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const role = await getOrgRole(supabase, applicant.org_id, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: notes, error } = await supabase
      .from('applicant_notes')
      .select('id, body, user_id, created_at')
      .eq('applicant_id', id)
      .order('created_at', { ascending: false })
    if (error) throw error

    return NextResponse.json({ notes: notes ?? [] })
  } catch (error) {
    console.error('[business/applicants/[id]/notes GET]', error)
    return NextResponse.json({ error: 'Could not load notes.' }, { status: 500 })
  }
}
