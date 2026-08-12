import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { optionalString } from '@/lib/validate'

const STATUSES = new Set(['saved', 'applied', 'screening', 'interviewing', 'offered', 'rejected', 'withdrawn'])

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('job_applications')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ application: data })
  } catch (error) {
    console.error('[job-tracker/[id] GET]', error)
    return NextResponse.json({ error: 'Could not load application.' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const update: Record<string, unknown> = {}

    if (body.company !== undefined) {
      if (typeof body.company !== 'string' || !body.company.trim()) {
        return NextResponse.json({ error: 'company must be a non-empty string' }, { status: 400 })
      }
      update.company = body.company.trim().slice(0, 200)
    }
    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim()) {
        return NextResponse.json({ error: 'title must be a non-empty string' }, { status: 400 })
      }
      update.title = body.title.trim().slice(0, 200)
    }
    if (body.url !== undefined) update.url = optionalString(body.url, 2000, 'url')
    if (body.jd_text !== undefined) update.jd_text = optionalString(body.jd_text, 50_000, 'jd_text')
    if (body.notes !== undefined) update.notes = optionalString(body.notes, 5000, 'notes')
    if (body.applied_at !== undefined) update.applied_at = body.applied_at || null
    if (body.status !== undefined) {
      if (!STATUSES.has(body.status)) {
        return NextResponse.json({ error: `status must be one of: ${[...STATUSES].join(', ')}` }, { status: 400 })
      }
      update.status = body.status
    }

    const { data, error } = await supabase
      .from('job_applications')
      .update(update)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ application: data })
  } catch (error) {
    if (error instanceof Error && error.name === 'ValidationError') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[job-tracker/[id] PATCH]', error)
    return NextResponse.json({ error: 'Could not update application.' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('job_applications')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[job-tracker/[id] DELETE]', error)
    return NextResponse.json({ error: 'Could not delete application.' }, { status: 500 })
  }
}
