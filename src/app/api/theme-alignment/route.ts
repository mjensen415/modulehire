import { NextResponse } from 'next/server'
import { aiComplete } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { jsonrepair } from 'jsonrepair'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid } from '@/lib/validate'

export const maxDuration = 60

type Gap = {
  theme: string
  module_id: string
  module_title: string
  original: string
  suggestion: string
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const limit = await checkAndLog(supabase, user.id, 'rl_theme_alignment', 30, 3600)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }

    const { module_ids, jd_id } = await req.json()
    if (!isUuid(jd_id)) return NextResponse.json({ error: 'Invalid jd_id' }, { status: 400 })
    if (!Array.isArray(module_ids) || module_ids.length === 0 || module_ids.length > 50 || !module_ids.every(isUuid)) {
      return NextResponse.json({ error: 'Invalid module_ids' }, { status: 400 })
    }

    // Scope JD lookup to this user
    const { data: jd, error: jdError } = await supabase
      .from('job_descriptions')
      .select('extracted_themes, extracted_phrases')
      .eq('id', jd_id)
      .eq('user_id', user.id)
      .single()
    if (jdError || !jd) return NextResponse.json({ error: 'Job description not found' }, { status: 404 })

    const { data: modules, error: modError } = await supabase
      .from('modules')
      .select('id, title, content, themes')
      .eq('user_id', user.id)
      .in('id', module_ids)
    if (modError) throw modError

    const jdThemes: string[] = jd.extracted_themes ?? []
    const jdPhrases: string[] = jd.extracted_phrases ?? []
    if (jdThemes.length === 0 || !modules || modules.length === 0) {
      return NextResponse.json({ matched: jdThemes, gaps: [] })
    }

    const moduleList = modules.map(m =>
      `- id: ${m.id}\n  title: ${m.title}\n  themes: ${(m.themes ?? []).join(', ')}\n  content: ${String(m.content ?? '').slice(0, 1500)}`
    ).join('\n\n')

    const prompt = `You are reviewing a candidate's resume modules against a job description.

JOB DESCRIPTION THEMES:
${jdThemes.join(', ')}

JOB DESCRIPTION KEY PHRASES:
${jdPhrases.join(', ')}

CANDIDATE MODULES (selected for this resume):
${moduleList}

TASK:
1. For each JD theme, decide whether ANY of the modules clearly addresses it (in title, themes, or content).
2. List themes that ARE clearly addressed in "matched".
3. For up to 6 themes that are NOT clearly addressed, identify the SINGLE module that comes closest in scope and could plausibly be re-framed to highlight that theme.
4. For each gap, write a "suggestion" — a 1-3 sentence rewrite that EXTENDS or RE-FRAMES the existing module content using JD language. The suggestion MUST stay grounded in facts present in the original content; do NOT invent metrics, companies, headcounts, or outcomes that aren't already implied. If the gap can't be honestly bridged from the existing content, omit it from the gaps array.

Output ONLY valid JSON in this exact shape, no markdown:
{
  "matched": ["theme1", "theme2"],
  "gaps": [
    { "theme": "theme name", "module_id": "<id from list above>", "module_title": "<title>", "original": "<the original module content, exact>", "suggestion": "<1-3 sentence augmented version that addresses the theme>" }
  ]
}`

    let result: { matched?: string[]; gaps?: Gap[] } = { matched: [], gaps: [] }
    try {
      const raw = await aiComplete([{ role: 'user', content: prompt }], 4096)
      const stripped = raw.replace(/```json/g, '').replace(/```/g, '')
      const start = stripped.indexOf('{')
      const end = stripped.lastIndexOf('}')
      if (start === -1 || end === -1) {
        return NextResponse.json({ matched: [], gaps: [] })
      }
      const cleanJson = stripped.slice(start, end + 1)
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,(\s*[}\]])/g, '$1')
      try {
        result = JSON.parse(cleanJson)
      } catch {
        result = JSON.parse(jsonrepair(cleanJson))
      }
    } catch (parseErr) {
      console.error('[theme-alignment] AI / parse failed:', parseErr)
      return NextResponse.json({ matched: [], gaps: [] })
    }

    // Validate against actual selected module IDs — drop any hallucinated entries
    const validModuleIds = new Set(modules.map(m => m.id))
    const moduleTitleById = new Map(modules.map(m => [m.id, m.title as string]))
    const moduleContentById = new Map(modules.map(m => [m.id, String(m.content ?? '')]))

    const gaps: Gap[] = (result.gaps ?? [])
      .filter(g => g && typeof g.theme === 'string' && validModuleIds.has(g.module_id))
      .slice(0, 6)
      .map(g => ({
        theme: g.theme,
        module_id: g.module_id,
        module_title: moduleTitleById.get(g.module_id) ?? g.module_title ?? '',
        original: moduleContentById.get(g.module_id) ?? g.original ?? '',
        suggestion: typeof g.suggestion === 'string' ? g.suggestion : '',
      }))
      .filter(g => g.suggestion.length > 0)

    const matched = (result.matched ?? []).filter((t): t is string => typeof t === 'string' && jdThemes.includes(t))

    return NextResponse.json({ matched, gaps })
  } catch (e) {
    console.error('[theme-alignment]', e)
    return NextResponse.json({ error: 'Could not align themes.' }, { status: 500 })
  }
}
