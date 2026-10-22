import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { getActiveProfileId } from '@/lib/profile'

type StoredRank = { module_id: string; match_score: number; include_reason: string }

// GET ?jd_id= — the latest logged match run for this JD, enriched with the active profile's
// current module data in the same shape POST /api/match-modules returns. Lets /generate restore
// the pick step after a refresh or Back without paying for a new AI match. Returns
// { run: null } when there is no run, or when none of its modules belong to the active profile.
export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const jdId = new URL(req.url).searchParams.get('jd_id')
    if (!isUuid(jdId)) return NextResponse.json({ error: 'Invalid jd_id' }, { status: 400 })

    const { data: run } = await supabase
      .from('match_runs')
      .select('ranked_modules, recommended_stack, created_at')
      .eq('user_id', user.id)
      .eq('jd_id', jdId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!run) return NextResponse.json({ run: null })

    const profileId = await getActiveProfileId(supabase, user.id)
    const { data: modules, error: modError } = await supabase
      .from('modules')
      .select('id, title, themes, weight, pinned, type, content, source_company, source_role_title, date_start, date_end, dimensions, role_types')
      .eq('user_id', user.id)
      .eq('profile_id', profileId)
      .is('deleted_at', null)
    if (modError) throw modError

    const moduleMap = new Map((modules ?? []).map(m => [m.id, m]))
    const ranked = (Array.isArray(run.ranked_modules) ? run.ranked_modules as StoredRank[] : [])
      .map(rm => {
        const m = moduleMap.get(rm.module_id)
        return m ? { ...rm, ...m, module_id: rm.module_id } : null
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
    if (ranked.length === 0) return NextResponse.json({ run: null })

    const rankedIds = new Set(ranked.map(m => m.module_id))
    return NextResponse.json({
      run: {
        ranked_modules: ranked,
        recommended_stack: (run.recommended_stack ?? []).filter((id: string) => rankedIds.has(id)),
        unmatched_modules: (modules ?? []).filter(m => !rankedIds.has(m.id)),
        created_at: run.created_at,
      },
    })
  } catch (error) {
    console.error('[match-runs]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
