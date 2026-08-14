import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgRole } from '@/lib/business/org-access'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: job, error: jobError } = await supabase
      .from('job_postings')
      .select('*')
      .eq('id', id)
      .single()
    if (jobError || !job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const role = await getOrgRole(supabase, job.org_id, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: criteria, error: criteriaError } = await supabase
      .from('scoring_criteria')
      .select('id, label, weight, description, sort_order, criterion_type, min_years')
      .eq('job_id', id)
      .order('sort_order', { ascending: true })
    if (criteriaError) throw criteriaError

    return NextResponse.json({ job: { ...job, criteria: criteria ?? [] } })
  } catch (error) {
    console.error('[business/job-postings/[id] GET]', error)
    return NextResponse.json({ error: 'Could not load job posting.' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: existing, error: existingError } = await supabase
      .from('job_postings')
      .select('org_id')
      .eq('id', id)
      .single()
    if (existingError || !existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const role = await getOrgRole(supabase, existing.org_id, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim()) {
        return NextResponse.json({ error: 'title must be a non-empty string' }, { status: 400 })
      }
      update.title = body.title.trim().slice(0, 200)
    }

    if (body.status !== undefined) {
      const allowed = ['draft', 'active', 'paused', 'closed']
      if (!allowed.includes(body.status)) {
        return NextResponse.json({ error: `status must be one of: ${allowed.join(', ')}` }, { status: 400 })
      }
      update.status = body.status
    }

    const { data: job, error } = await supabase
      .from('job_postings')
      .update(update)
      .eq('id', id)
      .select('id, title, status, updated_at')
      .single()
    if (error) throw error

    return NextResponse.json({ job })
  } catch (error) {
    console.error('[business/job-postings/[id] PATCH]', error)
    return NextResponse.json({ error: 'Could not update job posting.' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: existing } = await supabase
      .from('job_postings')
      .select('org_id')
      .eq('id', id)
      .single()
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const role = await getOrgRole(supabase, existing.org_id, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('job_postings')
      .delete()
      .eq('id', id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[business/job-postings/[id] DELETE]', error)
    return NextResponse.json({ error: 'Could not delete job posting.' }, { status: 500 })
  }
}
