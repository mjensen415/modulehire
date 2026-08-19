import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requiredString, ValidationError, isUuid } from '@/lib/validate'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: 'Invalid profile id' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    let name: string
    try {
      name = requiredString(body.name, 100, 'name')
    } catch (e) {
      if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
      throw e
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .update({ name })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, name')
      .single()
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ profile: data })
  } catch (error) {
    console.error('[profiles/[id] PATCH]', error)
    return NextResponse.json({ error: 'Could not rename profile.' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: 'Invalid profile id' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { count } = await supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: 'Cannot delete your only profile.' }, { status: 400 })
    }

    const { data: userRow } = await supabase
      .from('users')
      .select('active_profile_id')
      .eq('id', user.id)
      .single()
    const wasActive = userRow?.active_profile_id === id

    const { error } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) throw error

    if (wasActive) {
      const { data: another } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('user_id', user.id)
        .neq('id', id)
        .limit(1)
        .single()
      if (another) {
        await supabase.from('users').update({ active_profile_id: another.id }).eq('id', user.id)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[profiles/[id] DELETE]', error)
    return NextResponse.json({ error: 'Could not delete profile.' }, { status: 500 })
  }
}
