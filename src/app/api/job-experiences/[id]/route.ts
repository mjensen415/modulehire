import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { company, title, start_date, end_date, location } = body

    if (!company?.trim()) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
    }

    const adminClient = await createAdminClient()
    const { data, error } = await adminClient
      .from('job_experiences')
      .update({
        company: company.trim(),
        title: title || null,
        start_date: start_date || null,
        end_date: end_date || null,
        location: location || null,
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ job: data })
  } catch (e) {
    console.error('[job-experiences/[id] PATCH]', e)
    return NextResponse.json({ error: 'Could not save changes.' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminClient = await createAdminClient()
    const { error } = await adminClient
      .from('job_experiences')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[job-experiences/[id] DELETE]', e)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
