import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aiComplete } from '@/lib/ai'
import { jsonrepair } from 'jsonrepair'

const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { jd_id, current_summary } = await req.json()
    if (!isUuid(jd_id)) {
      return NextResponse.json({ error: 'Invalid jd_id' }, { status: 400 })
    }

    const { data: jd, error: jdErr } = await supabase
      .from('job_descriptions')
      .select('extracted_company, extracted_role_type, extracted_seniority, extracted_themes, extracted_phrases')
      .eq('id', jd_id)
      .eq('user_id', user.id)
      .single()
    if (jdErr || !jd) return NextResponse.json({ error: 'Job description not found' }, { status: 404 })

    const themes = (jd.extracted_themes ?? []) as string[]
    const phrases = (jd.extracted_phrases ?? []) as string[]

    // Pick the few most distinctive theme/phrase chips to surface to the user.
    const themesUsed = themes.slice(0, 6)
    const phrasesUsed = phrases.slice(0, 4)

    const savedSummaryBlock = typeof current_summary === 'string' && current_summary.trim().length > 0
      ? `\nThe candidate's current saved summary (preserve their voice and core positioning):\n"""\n${current_summary.trim()}\n"""\n`
      : ''

    const prompt = `Write a tailored 3-4 sentence professional summary for the candidate's resume. The summary should align with the role below while sounding natural and human — not stuffed with keywords.

ROLE:
- Company: ${jd.extracted_company ?? 'unspecified'}
- Role type: ${jd.extracted_role_type ?? 'unspecified'}
- Seniority: ${jd.extracted_seniority ?? 'unspecified'}
- Key themes: ${themes.join(', ') || '(none extracted)'}
- Key phrases to mirror where natural: ${phrases.join(', ') || '(none extracted)'}
${savedSummaryBlock}
RULES:
- 3-4 sentences. No more.
- Lead with a one-line positioning statement, then 2-3 sentences of relevant scope/impact.
- Mirror 2-4 of the role's key themes or phrases naturally — never list them.
- Do not invent specific facts (companies, metrics, titles) the candidate hasn't stated.
- If a saved summary is provided, keep its core voice; rewrite only to align with this role.

Return only raw JSON with no markdown, no code fences, and no explanation. The very first character of your response must be { and the very last character must be }.

Required shape:
{
  "suggested": "the 3-4 sentence summary",
  "themes_used": ["theme1", "theme2"]
}`

    const raw = await aiComplete([{ role: 'user', content: prompt }], 400)
    const stripped = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start === -1 || end === -1) {
      console.error('[suggest-summary] No JSON object found. Raw response:', raw)
      return NextResponse.json({ error: 'AI did not return JSON' }, { status: 502 })
    }

    let parsed: { suggested?: unknown; themes_used?: unknown }
    try {
      parsed = JSON.parse(jsonrepair(stripped.slice(start, end + 1)))
    } catch (parseErr) {
      console.error('[suggest-summary] JSON.parse failed:', parseErr)
      console.error('[suggest-summary] Raw response:', raw)
      console.error('[suggest-summary] Sliced JSON candidate:', stripped.slice(start, end + 1))
      return NextResponse.json({ error: 'AI returned malformed JSON' }, { status: 502 })
    }

    const suggested = typeof parsed.suggested === 'string' ? parsed.suggested.trim() : ''
    if (!suggested) {
      return NextResponse.json({ error: 'AI returned empty summary' }, { status: 502 })
    }

    const aiThemes = Array.isArray(parsed.themes_used)
      ? parsed.themes_used.map(String).filter(Boolean).slice(0, 8)
      : []

    return NextResponse.json({
      suggested,
      themes_used: aiThemes.length > 0 ? aiThemes : themesUsed,
      jd_themes: themesUsed,
      jd_phrases: phrasesUsed,
    })
  } catch (e) {
    console.error('[suggest-summary]', e)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
