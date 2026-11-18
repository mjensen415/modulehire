import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveProfileId } from '@/lib/profile'
import { computeTodaySteps, dayParam } from '@/lib/today'

// GET ?day=YYYY-MM-DD (the user's local date): the first three steps not dismissed that day.
// POST { step_key, day }: check a step off for that day.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const day = dayParam(new URL(req.url).searchParams.get('day'))
  const profileId = await getActiveProfileId(supabase, user.id)
  const [steps, { data: dismissed }] = await Promise.all([
    computeTodaySteps(supabase, user.id, profileId),
    supabase.from('home_step_dismissals').select('step_key').eq('user_id', user.id).eq('day', day),
  ])
  const hidden = new Set((dismissed ?? []).map(d => d.step_key))
  const open = steps.filter(s => !hidden.has(s.key))
  return NextResponse.json({ steps: open.slice(0, 3), done_today: hidden.size, remaining: Math.max(0, open.length - 3) })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const key = typeof body?.step_key === 'string' ? body.step_key.slice(0, 200) : ''
  if (!key) return NextResponse.json({ error: 'step_key required' }, { status: 400 })
  const { error } = await supabase
    .from('home_step_dismissals')
    .upsert({ user_id: user.id, step_key: key, day: dayParam(body?.day) }, { onConflict: 'user_id,step_key,day', ignoreDuplicates: true })
  if (error) {
    console.error('[home/today]', error)
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
