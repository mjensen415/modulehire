import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: 'Invalid profile id' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { error } = await supabase.from('users').update({ active_profile_id: id }).eq('id', user.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[profiles/[id]/activate POST]', error)
    return NextResponse.json({ error: 'Could not switch profile.' }, { status: 500 })
  }
}
