import { NextResponse } from 'next/server'
import { aiComplete } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid } from '@/lib/validate'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const limit = await checkAndLog(supabase, user.id, 'rl_suggest_rewrite', 20, 3600)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
      )
    }

    const { module_id, jd_id } = await req.json()
    if (!isUuid(module_id) || !isUuid(jd_id)) {
      return NextResponse.json({ error: 'Invalid module_id or jd_id' }, { status: 400 })
    }

    const { data: moduleRow } = await supabase
      .from('modules')
      .select('id, title, content')
      .eq('id', module_id)
      .eq('user_id', user.id)
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

    const prompt = `You are helping a job seeker tailor a resume module to better match a specific job description.

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

    const raw = await aiComplete([{ role: 'user', content: prompt }], 512)

    return NextResponse.json({ suggestion: raw.trim() })
  } catch (error) {
    console.error('[suggest-module-rewrite]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
