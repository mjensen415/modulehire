import { NextResponse } from 'next/server'
import { aiCompleteJson } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid } from '@/lib/validate'
import { sanitizeCriteria } from '@/lib/dimensions'
import { allBlocks, docText, parseResumeDoc, type BlockSuggestion } from '@/lib/resume-doc'
import { unsupportedClaims } from '@/lib/fact-check'
import { scoreLiveFit } from '@/lib/live-fit'

export const maxDuration = 60

type RouteContext = { params: Promise<{ id: string }> }


const SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          block_id: { type: 'string', description: 'Exact id of a line listed above' },
          new_text: { type: 'string', description: 'The rewritten line, under 25 words' },
          reason: { type: 'string', description: 'Max 12 words: which requirement it helps and how' },
        },
        required: ['block_id', 'new_text', 'reason'],
      },
    },
  },
  required: ['suggestions'],
}

// POST { doc? } — up to 5 line rewrites that bring the resume closer to the posting's
// requirements it doesn't yet cover, each fact-checked against the line's own module. Returned
// as operations on blocks; the editor applies an accepted one through the same transaction as
// typing, so undo and history cover it. `doc` (optional) is the editor's current document, so
// suggestions match what's on screen even if the last edit isn't saved yet.
export async function POST(req: Request, { params }: RouteContext) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { data: row } = await supabase
      .from('resume_documents')
      .select('doc, job_description_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const parsed = parseResumeDoc(body?.doc ?? row.doc)
    if (!parsed.ok) return NextResponse.json({ error: 'Invalid document' }, { status: 400 })
    const doc = parsed.doc

    const { data: jd } = row.job_description_id
      ? await supabase.from('job_descriptions').select('extracted_company, extracted_job_title, extracted_criteria').eq('id', row.job_description_id).eq('user_id', user.id).maybeSingle()
      : { data: null }
    const criteria = sanitizeCriteria(jd?.extracted_criteria)
    if (criteria.length === 0) return NextResponse.json({ suggestions: [] })

    // Lines that came from a module are the only ones a suggestion may change.
    const lines = allBlocks(doc).filter(b => b.block.module_id && isUuid(b.block.module_id) && b.block.text.trim())
    const moduleIds = [...new Set(lines.map(l => l.block.module_id!))]
    if (moduleIds.length === 0) return NextResponse.json({ suggestions: [] })
    const { data: modules } = await supabase.from('modules').select('id, title, content').in('id', moduleIds).eq('user_id', user.id)
    const moduleById = new Map((modules ?? []).map(m => [m.id, m]))

    const gaps = scoreLiveFit(docText(doc), criteria).criteria.filter(c => !c.covered)
    if (gaps.length === 0) return NextResponse.json({ suggestions: [] })

    const limit = await checkAndLog(supabase, user.id, 'rl_doc_suggestions', 30, 3600)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }

    const gapBlock = gaps.map(g => {
      const c = criteria.find(x => x.label === g.label)!
      return `- ${c.label} (weight ${c.weight}/5)${(c.also_called ?? []).length ? ` — their words: ${(c.also_called ?? []).map(p => `"${p}"`).join(', ')}` : ''}`
    }).join('\n')
    const lineBlock = lines
      .filter(l => moduleById.has(l.block.module_id!))
      .map(l => {
        const m = moduleById.get(l.block.module_id!)!
        return `- id: ${l.block.id}\n  line: ${l.block.text}\n  its module (the only facts this line may use): ${m.title}: ${String(m.content).slice(0, 900)}`
      }).join('\n')

    const result = await aiCompleteJson<{ suggestions: Array<{ block_id: string; new_text: string; reason: string }> }>(
      [
        { role: 'system', content: 'You suggest small, truthful edits to resume lines so a resume shows requirements the candidate genuinely meets.' },
        { role: 'user', content: `JOB: ${jd?.extracted_job_title ?? 'this role'}${jd?.extracted_company ? ` at ${jd.extracted_company}` : ''}

REQUIREMENTS THE RESUME DOESN'T SHOW YET:
${gapBlock}

RESUME LINES:
${lineBlock}

Suggest up to 5 line rewrites. Only suggest one when a line's own module shows the candidate did the thing a requirement asks for, and the current line just doesn't say so. Use the posting's wording where it names the same thing. Each rewrite stays under 25 words and uses only facts in that line's module: never add a number, tool, company, name, scope, or outcome. If no line can honestly cover a requirement, suggest nothing for it. Fewer, better suggestions beat more.` },
      ],
      SCHEMA,
      2048,
      { tier: 'fast', userId: user.id, action: 'ai_doc_suggestions' },
    )

    const context = [jd?.extracted_company ?? '', jd?.extracted_job_title ?? '', doc.header.name, ...doc.experience.flatMap(e => [e.company, e.title])]
    const byId = new Map(lines.map(l => [l.block.id, l.block]))
    const seen = new Set<string>()
    const suggestions: BlockSuggestion[] = []
    for (const s of Array.isArray(result.suggestions) ? result.suggestions : []) {
      const block = byId.get(s?.block_id)
      const text = typeof s?.new_text === 'string' ? s.new_text.trim().replace(/^["“•\-\s]+|["”\s]+$/g, '') : ''
      if (!block || !text || seen.has(block.id) || text === block.text) continue
      const m = moduleById.get(block.module_id!)
      if (!m || unsupportedClaims(text, [m.content, m.title], context).length > 0) continue
      seen.add(block.id)
      suggestions.push({
        block_id: block.id,
        new_text: text,
        reason: typeof s.reason === 'string' ? s.reason.trim().slice(0, 140) : '',
        module_id: block.module_id,
        based_on: block.text,
      })
      if (suggestions.length >= 5) break
    }
    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('[resume-docs suggestions]', error)
    return NextResponse.json({ error: 'Could not find suggestions.' }, { status: 500 })
  }
}
