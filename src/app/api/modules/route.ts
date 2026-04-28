import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requiredString, optionalString, ValidationError } from '@/lib/validate'
import { moduleLimit } from '@/lib/plan'

const VALID_WEIGHTS = new Set(['anchor', 'strong', 'supporting'])
const VALID_TYPES = new Set(['experience', 'skill', 'story', 'positioning'])
const VALID_EMP_TYPES = new Set(['full-time', 'consulting', 'contract', 'board', 'volunteer'])

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Plan module-cap gate (skipped for pro)
    const { data: profileRow } = await supabase
      .from('users')
      .select('plan')
      .eq('id', user.id)
      .single()
    const plan = (profileRow?.plan ?? 'free') as string
    if (plan !== 'pro') {
      const { count: existingCount } = await supabase
        .from('modules')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('deleted_at', null)
      const cap = moduleLimit(plan)
      if ((existingCount ?? 0) >= cap) {
        return NextResponse.json(
          { error: 'Module limit reached for your plan.', code: 'MODULE_LIMIT_REACHED', limit: cap },
          { status: 403 }
        )
      }
    }

    const body = await req.json()

    let row
    try {
      row = {
        user_id: user.id,
        title: requiredString(body.title, 200, 'title'),
        content: requiredString(body.content, 50_000, 'content'),
        weight: VALID_WEIGHTS.has(body.weight) ? body.weight : 'supporting',
        type: VALID_TYPES.has(body.type) ? body.type : 'experience',
        source_company: optionalString(body.source_company, 200, 'source_company'),
        source_role_title: optionalString(body.source_role_title, 200, 'source_role_title'),
        date_start: optionalString(body.date_start, 20, 'date_start'),
        date_end: optionalString(body.date_end, 20, 'date_end'),
        employment_type: VALID_EMP_TYPES.has(body.employment_type) ? body.employment_type : null,
      }
    } catch (e) {
      if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
      throw e
    }

    const { data, error } = await supabase.from('modules').insert(row).select().single()

    if (error) {
      console.error('[modules POST]', error)
      return NextResponse.json({ error: 'Could not save module.' }, { status: 500 })
    }
    return NextResponse.json({ module: data }, { status: 201 })
  } catch (error) {
    console.error('[modules POST]', error)
    return NextResponse.json({ error: 'Could not save module.' }, { status: 500 })
  }
}
