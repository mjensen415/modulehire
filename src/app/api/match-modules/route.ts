import { NextResponse } from 'next/server'
import { aiComplete } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { jsonrepair } from 'jsonrepair'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid } from '@/lib/validate'
import { getActiveProfileId } from '@/lib/profile'
import { getUserPreferences, buildPreferenceContext } from '@/lib/preferences'

export const maxDuration = 60

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

    // Cacheable prefix: this user's full module library, unchanged across different JDs matched
    // in the same session — Anthropic reuses it (ephemeral, ~5 min) instead of re-billing it.
    const libraryBlock = `You are a resume reviewer. Here is the candidate's full resume module library:

RESUME MODULES:
${moduleList}
`

    // Dynamic suffix: everything specific to this JD/request.
    const taskBlock = `Read the job description below and score every module above against it, then fill in the JSON template at the bottom.

DO NOT write code. DO NOT explain your reasoning. Output ONLY the filled-in JSON.

JOB DESCRIPTION:
Company: ${jd.extracted_company}
Role: ${jd.extracted_role_type}
Seniority: ${jd.extracted_seniority}
Key themes: ${(jd.extracted_themes || []).join(', ')}
Key phrases: ${(jd.extracted_phrases || []).join(', ')}

${prefContext ? prefContext + '\n\n' : ''}SCORING RULES:
- match_score is 0-100 based on how well the module's actual relevance matches the job description themes
- score every module honestly on fit to this specific job — do not give any module an automatic high score
- include_reason is a max 8-word phrase (not a full sentence) — be extremely concise

Fill in this exact JSON and output nothing else:
{
  "ranked_modules": [
    { "module_id": "<id from list above>", "match_score": <number>, "include_reason": "<one sentence>" }
  ],
  "recommended_stack": ["<id>", "<id>"]
}

The recommended_stack should contain the 4-8 highest-scoring module ids in order.

JSON:`

    const rawResponseText = await aiComplete(
      [{ role: 'user', content: [{ text: libraryBlock, cache: true }, { text: taskBlock }] }],
      4096
    )

    const stripped = rawResponseText.replace(/```json/g, '').replace(/```/g, '')
    const jsonStart = stripped.indexOf('{')
    const jsonEnd = stripped.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error(`Model did not return JSON. Response: ${stripped.slice(0, 200)}`)
    }
    const rawJson = stripped.slice(jsonStart, jsonEnd + 1)
    const cleanJson = rawJson
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,(\s*[}\]])/g, '$1')

    let result: { ranked_modules: Array<{ module_id: string; match_score: number; include_reason: string }>; recommended_stack: string[] }
    try {
      result = JSON.parse(cleanJson)
    } catch {
      try {
        result = JSON.parse(jsonrepair(cleanJson))
      } catch (e) {
        console.error('match-modules JSON parse failed. Raw model output:\n', rawResponseText)
        throw new Error(`JSON parse failed: ${(e as Error).message}. Raw: ${rawResponseText.slice(0, 400)}`)
      }
    }

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

      const pass2Prompt = `You are a resume reviewer. Re-score these shortlisted resume modules against the job description below, now that you can see their full content — not just title and themes.

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
- score every module honestly on fit to this specific job — do not give any module an automatic high score
- include_reason is a max 8-word phrase (not a full sentence) — be extremely concise

Fill in this exact JSON and output nothing else:
{
  "ranked_modules": [
    { "module_id": "<id from list above>", "match_score": <number>, "include_reason": "<one sentence>" }
  ]
}

JSON:`

      try {
        const pass2Raw = await aiComplete(
          [{ role: 'user', content: pass2Prompt }],
          2048,
          { model: process.env.ANTHROPIC_MODEL_QUALITY || 'claude-sonnet-5' }
        )
        const p2stripped = pass2Raw.replace(/```json/g, '').replace(/```/g, '')
        const p2start = p2stripped.indexOf('{')
        const p2end = p2stripped.lastIndexOf('}')
        if (p2start !== -1 && p2end !== -1) {
          const p2clean = p2stripped.slice(p2start, p2end + 1).replace(/,(\s*[}\]])/g, '$1')
          let pass2Result: { ranked_modules: Array<{ module_id: string; match_score: number; include_reason: string }> }
          try {
            pass2Result = JSON.parse(p2clean)
          } catch {
            pass2Result = JSON.parse(jsonrepair(p2clean))
          }
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
