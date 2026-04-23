import { NextResponse } from 'next/server'
import { aiComplete } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'

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

    const { jd_id } = await req.json()

    const { data: jd, error: jdError } = await supabase
      .from('job_descriptions')
      .select('*')
      .eq('id', jd_id)
      .single()
    if (jdError) throw jdError

    const { data: modules, error: modError } = await supabase
      .from('modules')
      .select('id, title, themes, weight, type, content, source_company, source_role_title, date_start, date_end')
      .eq('user_id', user.id)
    if (modError) throw modError

    const moduleList = modules.map(m =>
      `- id: ${m.id} | title: ${m.title} | themes: ${(m.themes || []).join(', ')} | weight: ${m.weight}`
    ).join('\n')

    const prompt = `You are a resume reviewer. Read the job description and the list of resume modules below, then fill in the JSON template at the bottom.

DO NOT write code. DO NOT explain your reasoning. Output ONLY the filled-in JSON.

JOB DESCRIPTION:
Company: ${jd.extracted_company}
Role: ${jd.extracted_role_type}
Seniority: ${jd.extracted_seniority}
Key themes: ${(jd.extracted_themes || []).join(', ')}
Key phrases: ${(jd.extracted_phrases || []).join(', ')}

RESUME MODULES:
${moduleList}

SCORING RULES:
- match_score is 0-100 based on how well the module matches the job description themes
- anchor weight modules always score 100
- include_reason is one short sentence

Fill in this exact JSON and output nothing else:
{
  "ranked_modules": [
    { "module_id": "<id from list above>", "match_score": <number>, "include_reason": "<one sentence>" }
  ],
  "recommended_stack": ["<id>", "<id>"]
}

The recommended_stack should contain the 4-8 highest-scoring module ids in order.

JSON:`

    const rawResponseText = await aiComplete([{ role: 'user', content: prompt }], 2048)

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
    } catch (e) {
      console.error('match-modules JSON parse failed. Raw model output:\n', rawResponseText)
      throw new Error(`JSON parse failed: ${(e as Error).message}. Raw: ${rawResponseText.slice(0, 400)}`)
    }

    // Enrich ranked_modules with full module data
    const moduleMap = new Map(modules.map(m => [m.id, m]))
    const enrichedModules = result.ranked_modules
      .map(rm => {
        const m = moduleMap.get(rm.module_id)
        if (!m) return null
        return { ...rm, ...m, module_id: rm.module_id }
      })
      .filter(Boolean)

    // Also return all modules so the UI can show unmatched ones
    const rankedIds = new Set(result.ranked_modules.map(r => r.module_id))
    const unmatchedModules = modules.filter(m => !rankedIds.has(m.id))

    await supabase.from('usage_events').insert({ user_id: user.id, action: 'match_job' })

    return NextResponse.json({
      ranked_modules: enrichedModules,
      recommended_stack: result.recommended_stack,
      unmatched_modules: unmatchedModules,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
