import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requiredString, ValidationError } from '@/lib/validate'
import { getActiveProfileId } from '@/lib/profile'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const activeProfileId = await getActiveProfileId(supabase, user.id)

    const [{ data: profileRows, error: profilesError }, { data: moduleRows, error: modulesError }] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('id, name, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('modules')
        .select('profile_id')
        .eq('user_id', user.id)
        .is('deleted_at', null),
    ])
    if (profilesError) throw profilesError
    if (modulesError) throw modulesError

    const counts = new Map<string, number>()
    for (const row of moduleRows ?? []) {
      if (!row.profile_id) continue
      counts.set(row.profile_id, (counts.get(row.profile_id) ?? 0) + 1)
    }

    const profiles = (profileRows ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      module_count: counts.get(p.id) ?? 0,
      is_active: p.id === activeProfileId,
    }))

    return NextResponse.json({ profiles, active_profile_id: activeProfileId })
  } catch (error) {
    console.error('[profiles GET]', error)
    return NextResponse.json({ error: 'Could not load profiles.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
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
      .insert({ user_id: user.id, name })
      .select('id, name, created_at')
      .single()
    if (error) throw error

    return NextResponse.json({ profile: { ...data, module_count: 0, is_active: false } }, { status: 201 })
  } catch (error) {
    console.error('[profiles POST]', error)
    return NextResponse.json({ error: 'Could not create profile.' }, { status: 500 })
  }
}
