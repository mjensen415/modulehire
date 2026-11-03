import { NextResponse } from 'next/server'
import { resolveModel } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-guard'
import { isUuid } from '@/lib/validate'
import { buildPass2Prompt, loadMatchInputs, localShortlist, MatchError, rescoreShortlist, type MatchInputs } from '@/lib/match'

export const maxDuration = 120

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const { user } = guard

  try {
    const { jd_id, prompt_override, model } = await req.json()
    if (!isUuid(jd_id)) {
      return NextResponse.json({ error: 'Invalid jd_id' }, { status: 400 })
    }

    // Production parity (match-modules): a local term-overlap shortlist, then the score-only
    // AI pass 2 over it. The old one-call pass 1 over the whole library failed on large libraries.
    // The prompt override and model picker apply to pass 2, the only AI step.
    const supabase = await createClient()
    let inputs: MatchInputs
    try {
      inputs = await loadMatchInputs(supabase, user.id, jd_id)
    } catch (e) {
      if (e instanceof MatchError) return NextResponse.json({ error: e.message }, { status: e.status })
      throw e
    }
    const { pass1, shortlist } = localShortlist(inputs.jd, inputs)
    const promptOverride = typeof prompt_override === 'string' && prompt_override.trim() ? prompt_override : undefined
    const modelChoice = typeof model === 'string' && model ? model : undefined
    // No userId: Prompt Lab runs stay out of the production usage numbers.
    const ranked = await rescoreShortlist(inputs.jd, inputs, pass1, shortlist, '', { model: modelChoice, promptOverride })

    // Same enrichment and recommended stack as production; finishMatch's logging is skipped —
    // Prompt Lab runs are dry runs.
    const enriched = ranked
      .map(rm => {
        const m = inputs.moduleMap.get(rm.module_id)
        return m ? { ...rm, ...m, module_id: rm.module_id } : null
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
    const pinnedIds = enriched.filter(m => m.pinned).map(m => m.module_id)
    const nonPinned = [...enriched].filter(m => !m.pinned).sort((a, b) => b.match_score - a.match_score)
    const targetSize = Math.max(4, Math.min(8, pinnedIds.length + 6))
    const recommendedStack = [...pinnedIds, ...nonPinned.slice(0, Math.max(0, targetSize - pinnedIds.length)).map(m => m.module_id)]

    const local = new Map(pass1.map(p => [p.module_id, p.match_score]))
    return NextResponse.json({
      ranked_modules: enriched,
      recommended_stack: recommendedStack,
      unmatched_modules: [],
      raw_ai_response: JSON.stringify({
        shortlist: shortlist.map(m => ({ id: m.id, title: m.title, local_score: local.get(m.id) })),
        pass2: ranked.filter(r => shortlist.some(m => m.id === r.module_id)).map(r => ({ id: r.module_id, score: r.match_score })),
      }, null, 2),
      prompt_used: promptOverride ?? buildPass2Prompt(inputs.jd, inputs, shortlist).prompt,
      model_used: modelChoice || resolveModel('quality', 'match_job_pass2'),
    })
  } catch (error) {
    console.error('[admin/prompt-lab/match]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
