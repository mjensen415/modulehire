import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveProfileId } from '@/lib/profile'
import { getUsableModules } from '@/lib/usable-modules'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const profileId = await getActiveProfileId(supabase, user.id)

    // Confirmed only: drafts are listed by /api/modules/review-queue until the user confirms them.
    const { data, error } = await getUsableModules(supabase, 'id, title, weight, pinned, themes, type, source_company, dimensions')
      .eq('user_id', user.id)
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ modules: data ?? [] })
  } catch (e) {
    console.error('[my-modules/route.ts]', e)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
