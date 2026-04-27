import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { optionalString, ValidationError } from '@/lib/validate'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()

    let row
    try {
      row = {
        user_id: user.id,
        rating: typeof body.rating === 'number' && body.rating >= 1 && body.rating <= 5 ? body.rating : null,
        category: optionalString(body.category, 50, 'category'),
        message: optionalString(body.message, 5000, 'message'),
        page_url: optionalString(body.page_url, 500, 'page_url'),
      }
    } catch (e) {
      if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
      throw e
    }

    const { error } = await supabase.from('beta_feedback').insert(row)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[beta-feedback POST]', e)
    return NextResponse.json({ error: 'Could not save feedback.' }, { status: 500 })
  }
}
