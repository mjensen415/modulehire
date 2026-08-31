import { NextResponse } from 'next/server'
import { aiComplete } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-guard'
import { isUuid } from '@/lib/validate'
import { getActiveProfileId } from '@/lib/profile'
import { getUserPreferences, buildPreferenceContext } from '@/lib/preferences'

export const maxDuration = 60

function buildPrompt(moduleRow: { title: string; content: string }, themes: string[], phrases: string[], prefContext: string) {
  return `${prefContext ? prefContext + '\n\n' : ''}You are helping a job seeker tailor a resume module to better match a specific job description.

Module title: ${moduleRow.title}
Module content:
${moduleRow.content}

Job description themes: ${themes.join(', ')}
Key phrases from JD: ${phrases.join(', ')}

Rewrite the module content to better match this role. Rules:
- Keep all factual claims, job titles, company names, and dates exactly as written
- Do not invent metrics or achievements not already implied
- Do not change the candidate's seniority level or job title
- Keep the same approximate length and bullet structure
- Focus the language on the JD themes without becoming generic

Return ONLY the rewritten module content, no preamble, no explanation.`
}

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const { user } = guard

  try {
    const { module_id, jd_id, prompt_override, model } = await req.json()
    if (!isUuid(module_id) || !isUuid(jd_id)) {
      return NextResponse.json({ error: 'Invalid module_id or jd_id' }, { status: 400 })
    }

    const supabase = await createClient()

    const profileId = await getActiveProfileId(supabase, user.id)
    const { data: moduleRow } = await supabase
      .from('modules')
      .select('id, title, content')
      .eq('id', module_id)
      .eq('user_id', user.id)
      .eq('profile_id', profileId)
      .is('deleted_at', null)
      .single()
    if (!moduleRow) return NextResponse.json({ error: 'Module not found' }, { status: 404 })

    const { data: jd } = await supabase
      .from('job_descriptions')
      .select('id, extracted_themes, extracted_phrases')
      .eq('id', jd_id)
      .eq('user_id', user.id)
      .single()
    if (!jd) return NextResponse.json({ error: 'Job description not found' }, { status: 404 })

    const themes: string[] = jd.extracted_themes || []
    const phrases: string[] = jd.extracted_phrases || []

    const prefs = await getUserPreferences(supabase, user.id)
    const prefContext = buildPreferenceContext(prefs)

    const prompt = typeof prompt_override === 'string' && prompt_override.trim()
      ? prompt_override
      : buildPrompt(moduleRow, themes, phrases, prefContext)

    const raw = await aiComplete([{ role: 'user', content: prompt }], 512, { model: typeof model === 'string' ? model : undefined })

    return NextResponse.json({
      suggestion: raw.trim(),
      original: moduleRow.content,
      raw_ai_response: raw,
      prompt_used: prompt,
      model_used: model || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    })
  } catch (error) {
    console.error('[admin/prompt-lab/rewrite]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
