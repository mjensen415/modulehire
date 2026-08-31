import { NextResponse } from 'next/server'
import { aiComplete } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-guard'
import { isUuid } from '@/lib/validate'
import { getActiveProfileId } from '@/lib/profile'
import { getUserPreferences, buildPreferenceContext } from '@/lib/preferences'
import { jsonrepair } from 'jsonrepair'

export const maxDuration = 60

function buildPrompt(jd: { extracted_company: string; extracted_role_type: string; extracted_seniority: string; extracted_themes: string[]; extracted_phrases: string[] }, moduleList: string, prefContext: string) {
  return `You are a resume reviewer. Read the job description and the list of resume modules below, then fill in the JSON template at the bottom.

DO NOT write code. DO NOT explain your reasoning. Output ONLY the filled-in JSON.

JOB DESCRIPTION:
Company: ${jd.extracted_company}
Role: ${jd.extracted_role_type}
Seniority: ${jd.extracted_seniority}
Key themes: ${(jd.extracted_themes || []).join(', ')}
Key phrases: ${(jd.extracted_phrases || []).join(', ')}

RESUME MODULES:
${moduleList}

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
}

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const { user } = guard

  try {
    const { jd_id, prompt_override, model } = await req.json()
    if (!isUuid(jd_id)) {
      return NextResponse.json({ error: 'Invalid jd_id' }, { status: 400 })
    }

    const supabase = await createClient()

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

    const moduleList = (modules ?? []).map(m =>
      `- id: ${m.id} | title: ${m.title} | themes: ${(m.themes || []).join(', ')} | weight: ${m.weight}`
    ).join('\n')

    const prefs = await getUserPreferences(supabase, user.id)
    const prefContext = buildPreferenceContext(prefs)

    const prompt = typeof prompt_override === 'string' && prompt_override.trim()
      ? prompt_override
      : buildPrompt(jd, moduleList, prefContext)

    const rawResponseText = await aiComplete([{ role: 'user', content: prompt }], 4096, { model: typeof model === 'string' ? model : undefined })

    const stripped = rawResponseText.replace(/```json/g, '').replace(/```/g, '')
    const jsonStart = stripped.indexOf('{')
    const jsonEnd = stripped.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) {
      return NextResponse.json({
        error: `Model did not return JSON. Response: ${stripped.slice(0, 200)}`,
        raw_ai_response: rawResponseText,
        prompt_used: prompt,
      }, { status: 502 })
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
      result = JSON.parse(jsonrepair(cleanJson))
    }

    const WEIGHT_PRIOR: Record<string, number> = { anchor: 8, strong: 3, supporting: 0 }
    const moduleMap = new Map((modules ?? []).map(m => [m.id, m]))

    const adjustedRanked = result.ranked_modules.map(rm => {
      const m = moduleMap.get(rm.module_id)
      const prior = m ? (WEIGHT_PRIOR[m.weight] ?? 0) : 0
      return { ...rm, match_score: Math.min(100, Math.round(rm.match_score) + prior) }
    })

    const enrichedModules = adjustedRanked
      .map(rm => {
        const m = moduleMap.get(rm.module_id)
        if (!m) return null
        return { ...rm, ...m, module_id: rm.module_id }
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)

    const pinnedIds = enrichedModules.filter(m => m.pinned).map(m => m.module_id)
    const nonPinnedRanked = [...enrichedModules]
      .filter(m => !m.pinned)
      .sort((a, b) => b.match_score - a.match_score)
    const targetSize = Math.max(4, Math.min(8, pinnedIds.length + 6))
    const fillCount = Math.max(0, targetSize - pinnedIds.length)
    const recommendedStack = [...pinnedIds, ...nonPinnedRanked.slice(0, fillCount).map(m => m.module_id)]

    const rankedIds = new Set(result.ranked_modules.map(r => r.module_id))
    const unmatchedModules = (modules ?? []).filter(m => !rankedIds.has(m.id))

    return NextResponse.json({
      ranked_modules: enrichedModules,
      recommended_stack: recommendedStack,
      unmatched_modules: unmatchedModules,
      raw_ai_response: rawResponseText,
      prompt_used: prompt,
      model_used: model || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    })
  } catch (error) {
    console.error('[admin/prompt-lab/match]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
