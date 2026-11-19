import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAndLog } from '@/lib/rate-limit'

// Optional "what are you hiring for?" answer from Business onboarding. Stored as a
// product event (ev_biz_feedback) so no new table is needed. Read it with:
//   select created_at, metadata from usage_events where action = 'ev_biz_feedback' order by 1 desc;
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const limit = await checkAndLog(supabase, user.id, 'rl_biz_feedback', 5, 3600)
    if (!limit.ok) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 })

    const body = (await req.json()) as { text?: unknown; org_id?: unknown; context?: unknown }
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : ''
    if (!text) return NextResponse.json({ error: 'Nothing to send' }, { status: 400 })

    const { error } = await supabase.from('usage_events').insert({
      user_id: user.id,
      action: 'ev_biz_feedback',
      metadata: {
        text,
        org_id: typeof body.org_id === 'string' ? body.org_id : null,
        context: typeof body.context === 'string' ? body.context.slice(0, 40) : 'onboarding',
      },
    })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/business/feedback]', error)
    return NextResponse.json({ error: 'Could not save feedback.' }, { status: 500 })
  }
}
