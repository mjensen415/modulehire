import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Product measurement for the v2 generate flow, logged to usage_events as ev_<name>.
// Server-side events (ev_draft_created in /api/jobs/start, ev_export in the download route)
// log themselves; this takes the ones only the browser sees.
const CLIENT_EVENTS = new Set(['export_text', 'library_add', 'rail_tab'])

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const name = typeof body?.name === 'string' ? body.name : ''
  if (!CLIENT_EVENTS.has(name)) return NextResponse.json({ error: 'Unknown event' }, { status: 400 })
  // Small, flat metadata only.
  const metadata: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(body?.metadata ?? {}).slice(0, 8)) {
    if (typeof v === 'string') metadata[k] = v.slice(0, 100)
    else if (typeof v === 'number' || typeof v === 'boolean') metadata[k] = v
  }

  const { error } = await supabase.from('usage_events').insert({ user_id: user.id, action: `ev_${name}`, metadata })
  if (error) console.error('[events] insert failed:', error)
  return NextResponse.json({ ok: true })
}
