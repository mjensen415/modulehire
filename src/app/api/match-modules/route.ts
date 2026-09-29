import { NextResponse } from 'next/server'
import { aiCompleteJson } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid } from '@/lib/validate'
import { getActiveProfileId } from '@/lib/profile'
import { getUserPreferences, buildPreferenceContext } from '@/lib/preferences'

export const maxDuration = 120

type RankedModule = { module_id: string; match_score: number; include_reason: string }

const RANK_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    module_id: { type: 'string', description: 'Exact id from the module list above' },
    match_score: { type: 'number', description: '0-100' },
    include_reason: { type: 'string', description: 'Max 8-word phrase, not a full sentence' },
  },
  required: ['module_id', 'match_score', 'include_reason'],
}

const PASS1_SCHEMA = {
  type: 'object',
  properties: {
    ranked_modules: { type: 'array', items: RANK_ITEM_SCHEMA },
    recommended_stack: { type: 'array', items: { type: 'string' }, description: 'The 4-8 highest-scoring module ids, in order' },
  },
  required: ['ranked_modules', 'recommended_stack'],
}

const PASS2_SCHEMA = {
  type: 'object',
  properties: {
    ranked_modules: { type: 'array', items: RANK_ITEM_SCHEMA },
  },
  required: ['ranked_modules'],
}

export async function POST(req: Request) {
  try {
    let supabase = await createClient()
    let { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      const authHeader = req.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7)
        const authedClient = createAnonClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        )
        const { data } = await authedClient.auth.getUser()
        user = data.user
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (user) supabase = authedClient as any
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limit = await checkAndLog(supabase, user.id, 'rl_match_modules', 60, 3600)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }

    const { jd_id } = await req.json()
    if (!isUuid(jd_id)) {
      return NextResponse.json({ error: 'Invalid jd_id' }, { status: 400 })
    }

    // Scope JD lookup to this user — RLS should also enforce this, but be explicit
    const { data: jd, error: jdError } = await supabase
      .from('job_descriptions')
      .select('*')
      .eq('id', jd_id)
      .eq('user_id', user.id)
      .single()
    if (jdError || !jd) return NextResponse.json({ error: 'Job description not found' }, { status: 404 })

    const profileId = await getActiveProfileId(supabase, user.id)
    const { data: modules, error: modError } = await supabase
      .from('modules')
      .select('id, title, themes, weight, pinned, type, content, source_company, source_role_title, date_start, date_end')
      .eq('user_id', user.id)
      .eq('profile_id', profileId)
    if (modError) throw modError

    const moduleList = modules.map(m =>
      `- id: ${m.id} | title: ${m.title} | themes: ${(m.themes || []).join(', ')} | weight: ${m.weight}`
    ).join('\n')

    const prefs = await getUserPreferences(supabase, user.id)
    const prefContext = buildPreferenceContext(prefs)

    // If a Match Report already scored this JD against this profile, surface its per-criterion
    // scores so ranking agrees with the report instead of re-deriving an independent judgment.
    type StoredReport = { criteria: Array<{ label: string; weight: number; score: number; evidence: Array<{ id: string; title: string }> }> }
    const storedReport = jd.match_report_profile_id === profileId ? (jd.match_report as StoredReport | null) : null
    const reportContext = storedReport && storedReport.criteria?.length
      ? `\n\nMATCH REPORT CONTEXT (this candidate was already scored against this JD's criteria — use it to calibrate, don't just copy it):\n${storedReport.criteria.map(c =>
          `- "${c.label}" (weight ${c.weight}/5): ${c.score}% match${c.evidence?.length ? ` — strongest evidence: ${c.evidence.map(e => e.title).join(', ')}` : ''}`
        ).join('\n')}`
      : ''

    // Cacheable prefix: this user's full module library, unchanged across different JDs matched
    // in the same session — Anthropic reuses it (ephemeral, ~5 min) instead of re-billing it.
    // Kept in the user message (not system) since cache_control on content blocks is only
    // honored there — the system message is always flattened to a plain string.
    const libraryBlock = `Here is the candidate's full resume module library:

RESUME MODULES:
${moduleList}
`

    // Dynamic suffix: everything specific to this JD/request.
    const taskBlock = `Score every module above against the job description below.

JOB DESCRIPTION:
Company: ${jd.extracted_company}
Role: ${jd.extracted_role_type}
Seniority: ${jd.extracted_seniority}
Key themes: ${(jd.extracted_themes || []).join(', ')}
Key phrases: ${(jd.extracted_phrases || []).join(', ')}

${prefContext ? prefContext + '\n\n' : ''}SCORING RULES:
- match_score is 0-100 based on how well the module's actual relevance matches the job description themes
- score every module honestly on fit to this specific job — do not give any module an automatic high score
- recommended_stack should contain the 4-8 highest-scoring module ids, in order${reportContext}`

    const result = await aiCompleteJson<{ ranked_modules: RankedModule[]; recommended_stack: string[] }>(
      [
        { role: 'system', content: 'You are a resume reviewer.' },
        { role: 'user', content: [{ text: libraryBlock, cache: true }, { text: taskBlock }] },
      ],
      PASS1_SCHEMA,
      4096,
      { tier: 'fast' }
    )

    // Weight is a minor, code-applied nudge — never an override. This is deliberately not part
    // of the prompt: trusting the model to self-limit an "always score 100" rule is exactly what
    // broke this before (over-tagged anchor modules auto-maxed regardless of JD fit).
    const WEIGHT_PRIOR: Record<string, number> = { anchor: 8, strong: 3, supporting: 0 }
    const moduleMap = new Map(modules.map(m => [m.id, m]))

    const pass1Ranked = result.ranked_modules.map(rm => {
      const m = moduleMap.get(rm.module_id)
      const prior = m ? (WEIGHT_PRIOR[m.weight] ?? 0) : 0
      return { ...rm, match_score: Math.min(100, Math.round(rm.match_score) + prior) }
    })

    // Pass 2: pass 1 only ever saw title/themes/weight — it can't tell a strong module from a
    // vague one with a good title. Re-score the top of the list with full content, so the score
    // that actually decides recommended_stack reflects what the module says, not just its label.
    const PASS2_SHORTLIST_SIZE = 24
    const shortlist = [...pass1Ranked]
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, PASS2_SHORTLIST_SIZE)
      .map(rm => moduleMap.get(rm.module_id))
      .filter((m): m is NonNullable<typeof m> => m !== undefined)

    let adjustedRanked = pass1Ranked
    if (shortlist.length > 0) {
      const shortlistBlock = shortlist.map(m =>
        `- id: ${m.id} | title: ${m.title} | themes: ${(m.themes || []).join(', ')} | weight: ${m.weight}\n  content: ${String(m.content ?? '').slice(0, 1500)}`
      ).join('\n')

      const pass2Prompt = `Re-score these shortlisted resume modules against the job description below, now that you can see their full content — not just title and themes.

JOB DESCRIPTION:
Company: ${jd.extracted_company}
Role: ${jd.extracted_role_type}
Seniority: ${jd.extracted_seniority}
Key themes: ${(jd.extracted_themes || []).join(', ')}
Key phrases: ${(jd.extracted_phrases || []).join(', ')}

SHORTLISTED MODULES:
${shortlistBlock}

${prefContext ? prefContext + '\n\n' : ''}SCORING RULES:
- match_score is 0-100 based on how well the module's actual content matches the job description — a good title with weak or unrelated content should score lower than pass 1 suggested
- score every module honestly on fit to this specific job — do not give any module an automatic high score${reportContext}`

      try {
        const pass2Result = await aiCompleteJson<{ ranked_modules: RankedModule[] }>(
          [
            { role: 'system', content: 'You are a resume reviewer.' },
            { role: 'user', content: pass2Prompt },
          ],
          PASS2_SCHEMA,
          2048,
          { tier: 'quality', userId: user.id, action: 'match_job_pass2' }
        )
        {
          const pass2Scores = new Map(pass2Result.ranked_modules.map(rm => {
            const m = moduleMap.get(rm.module_id)
            const prior = m ? (WEIGHT_PRIOR[m.weight] ?? 0) : 0
            return [rm.module_id, { match_score: Math.min(100, Math.round(rm.match_score) + prior), include_reason: rm.include_reason }]
          }))
          // Pass 2 refines the shortlist; everything else keeps its pass-1 score.
          adjustedRanked = pass1Ranked.map(rm => pass2Scores.get(rm.module_id) ? { ...rm, ...pass2Scores.get(rm.module_id) } : rm)
        }
      } catch (pass2Error) {
        // Pass 2 is a refinement, not a requirement — fall back to pass 1 scores rather than
        // failing the whole match if the second call errors.
        console.error('[match-modules] pass 2 failed, using pass 1 scores:', pass2Error)
      }
    }

    // Enrich with full module data
    const enrichedModules = adjustedRanked
      .map(rm => {
        const m = moduleMap.get(rm.module_id)
        if (!m) return null
        return { ...rm, ...m, module_id: rm.module_id }
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)

    // recommended_stack: pinned modules always included (their real score still shows honestly),
    // then fill the remaining 4-8 slots with the next highest-scoring non-pinned modules.
    const pinnedIds = enrichedModules.filter(m => m.pinned).map(m => m.module_id)
    const nonPinnedRanked = [...enrichedModules]
      .filter(m => !m.pinned)
      .sort((a, b) => b.match_score - a.match_score)
    const targetSize = Math.max(4, Math.min(8, pinnedIds.length + 6))
    const fillCount = Math.max(0, targetSize - pinnedIds.length)
    const recommendedStack = [...pinnedIds, ...nonPinnedRanked.slice(0, fillCount).map(m => m.module_id)]

    // Also return all modules so the UI can show unmatched ones
    const rankedIds = new Set(result.ranked_modules.map(r => r.module_id))
    const unmatchedModules = modules.filter(m => !rankedIds.has(m.id))

    await supabase.from('usage_events').insert({ user_id: user.id, action: 'match_job' })

    // Log what the matcher decided, for later validation against real usage — fire-and-forget,
    // a logging failure must never fail the match itself.
    const { error: logError } = await supabase.from('match_runs').insert({
      user_id: user.id,
      jd_id,
      ranked_modules: enrichedModules.map(m => ({ module_id: m.module_id, match_score: m.match_score, include_reason: m.include_reason })),
      recommended_stack: recommendedStack,
    })
    if (logError) console.error('[match-modules] match_runs insert failed:', logError)

    return NextResponse.json({
      ranked_modules: enrichedModules,
      recommended_stack: recommendedStack,
      unmatched_modules: unmatchedModules,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
