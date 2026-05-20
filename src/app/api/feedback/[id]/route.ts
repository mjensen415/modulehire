import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

const VALID_STATUSES = new Set(['new', 'in_progress', 'resolved'])

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('users').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { status } = await req.json()
    if (!VALID_STATUSES.has(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

    const adminClient = await createAdminClient()
    const { data, error } = await adminClient
      .from('beta_feedback')
      .update({ status })
      .eq('id', id)
      .select('id, status')
      .single()

    if (error) throw error
    return NextResponse.json({ feedback: data })
  } catch (e) {
    console.error('[feedback/[id] PATCH]', e)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
