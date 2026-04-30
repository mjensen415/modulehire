import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET — fetch current user's draft (returns null if none)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ draft: null })

  const { data } = await supabase
    .from('draft_generations')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({ draft: data ?? null })
}

// PUT — upsert draft (create or overwrite)
export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  const { error } = await supabase
    .from('draft_generations')
    .upsert(
      { ...body, user_id: user.id, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — clear draft after successful generation or explicit reset
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase
    .from('draft_generations')
    .delete()
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
