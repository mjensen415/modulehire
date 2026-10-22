import { NextResponse } from 'next/server'
import { aiStream } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid } from '@/lib/validate'
import { sanitizeCriteria } from '@/lib/dimensions'
import { parseResumeDoc, modulesOnResume } from '@/lib/resume-doc'
import { unsupportedClaims } from '@/lib/fact-check'

export const maxDuration = 60

type RouteContext = { params: Promise<{ id: string }> }
type Action = 'shorter' | 'stronger' | 'their_words' | 'custom'
const ACTIONS = new Set<Action>(['shorter', 'stronger', 'their_words', 'custom'])

const REJECTED = "Couldn't improve this without adding facts you haven't told us."

const TASKS: Record<Action, (instruction: string) => string> = {
  shorter: () => 'Make it shorter and tighter. Keep its meaning and its strongest fact.',
  stronger: () => 'Make it stronger: lead with a concrete action verb and the outcome the source states.',
  their_words: () => "Swap the line's wording for the posting's own phrasing (from the requirements above) only where the posting phrase names the same thing the source states, e.g. \"onboarding calls\" → \"onboarding programs\" if the source describes a program. Never append a posting phrase as a goal or result (\"to accelerate time-to-value\"). If no phrasing fits, return the line nearly unchanged.",
  custom: instruction => `Follow this request: ${instruction}`,
}

function overlap(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3))
  return b.toLowerCase().split(/\W+/).filter(w => w.length > 3 && wa.has(w)).length
}

// POST { block_id, action, instruction?, text, module_id, job_id?, neighbors? } → NDJSON stream:
// {"type":"delta","text"} … then {"type":"done","text","module_id"} or {"type":"rejected","message"}.
// The line's current text comes from the client (it may not be saved yet); the facts it may use
// always come from the database.
export async function POST(req: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = await checkAndLog(supabase, user.id, 'rl_block_rewrite', 120, 3600)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
  }

  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const body = await req.json().catch(() => ({}))
  const action = body?.action as Action
  if (!ACTIONS.has(action)) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  const instruction = typeof body?.instruction === 'string' ? body.instruction.trim().slice(0, 200) : ''
  if (action === 'custom' && !instruction) return NextResponse.json({ error: 'Tell us what to change' }, { status: 400 })
  const text = typeof body?.text === 'string' ? body.text.slice(0, 1000) : ''
  const neighbors: string[] = Array.isArray(body?.neighbors) ? body.neighbors.filter((n: unknown) => typeof n === 'string').slice(0, 12).map((n: string) => n.slice(0, 400)) : []

  const { data: row } = await supabase
    .from('resume_documents')
    .select('doc, job_description_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const parsed = parseResumeDoc(row.doc)
  if (!parsed.ok) return NextResponse.json({ error: 'This resume document is damaged.' }, { status: 422 })
  const doc = parsed.doc

  // Source facts: the line's module; for a blank line, its job's modules; for the summary
  // (no module), every module on the resume.
  type Mod = { id: string; title: string; content: string }
  let sources: Mod[] = []
  if (isUuid(body?.module_id)) {
    const { data } = await supabase.from('modules').select('id, title, content').eq('id', body.module_id).eq('user_id', user.id).maybeSingle()
    if (data) sources = [data as Mod]
  } else if (isUuid(body?.job_id)) {
    const { data } = await supabase
      .from('module_job_assignments')
      .select('modules!inner(id, title, content, user_id, deleted_at)')
      .eq('job_id', body.job_id)
      .eq('modules.user_id', user.id)
      .is('modules.deleted_at', null)
    sources = (data ?? []).map(r => (Array.isArray(r.modules) ? r.modules[0] : r.modules) as Mod).filter(Boolean)
  } else {
    const ids = [...modulesOnResume(doc)].filter(isUuid)
    if (ids.length > 0) {
      const { data } = await supabase.from('modules').select('id, title, content').in('id', ids).eq('user_id', user.id)
      sources = (data ?? []) as Mod[]
    }
  }
  if (sources.length === 0) {
    return NextResponse.json({ error: "This line isn't linked to anything in your library, so there are no facts to work from." }, { status: 400 })
  }

  const { data: jd } = row.job_description_id
    ? await supabase.from('job_descriptions').select('extracted_company, extracted_job_title, extracted_criteria').eq('id', row.job_description_id).eq('user_id', user.id).maybeSingle()
    : { data: null }
  const criteria = sanitizeCriteria(jd?.extracted_criteria)
    .sort((a, b) => (b.mentions ?? 1) - (a.mentions ?? 1) || b.weight - a.weight)
    .slice(0, 6)

  const isSummary = !isUuid(body?.module_id) && !isUuid(body?.job_id)
  // The posting's wording only goes in front of the model when it's asked to use it — given it
  // for "shorter"/"stronger" it bolts on purposes the source never states ("to accelerate
  // time-to-value"), which the number/name check can't catch.
  const showPosting = (action === 'their_words' || action === 'custom') && criteria.length > 0
  const prompt = `SOURCE ${sources.length > 1 ? 'MODULES' : 'MODULE'} (the only facts you may use):
${sources.map(s => `- ${s.title}: ${s.content.slice(0, 1500)}`).join('\n')}

CURRENT LINE:
${text || '(empty — write a new line from the source)'}
${neighbors.length > 0 ? `\nOTHER LINES NEARBY (don't repeat what they say):\n${neighbors.map(n => `- ${n}`).join('\n')}\n` : ''}${showPosting ? `\nTHE POSTING'S TOP REQUIREMENTS${jd?.extracted_job_title ? ` (${jd.extracted_job_title}${jd.extracted_company ? ` at ${jd.extracted_company}` : ''})` : ''}:\n${criteria.map(c => `- ${c.label}${(c.also_called ?? []).length ? ` — their words: ${(c.also_called ?? []).map(p => `"${p}"`).join(', ')}` : ''}`).join('\n')}\n` : ''}
TASK: ${TASKS[action](instruction)}

RULES:
- Rewrite only this one line, under 25 words.${text ? '\n- Keep it about the same thing the current line says; don\'t swap in other facts from the source.' : ''}
- Use only facts in the source: never add a number, tool, company, name, scope, outcome, or purpose ("to drive X", "to accelerate Y") it doesn't state.
- ${isSummary ? 'Write it as a resume summary sentence.' : 'Past tense, starting with an action verb.'}
- Output only the line: no quotes, no bullet glyph, no explanation.`

  const context = [jd?.extracted_company ?? '', jd?.extracted_job_title ?? '', doc.header.name, ...doc.experience.flatMap(e => [e.company, e.title])]

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(new TextEncoder().encode(JSON.stringify(obj) + '\n'))
      let out = ''
      try {
        for await (const delta of aiStream(
          [{ role: 'system', content: 'You rewrite one line of a resume, using only facts the candidate has given.' }, { role: 'user', content: prompt }],
          300,
          { tier: 'fast', userId: user.id, action: 'ai_block_rewrite' },
        )) {
          out += delta
          send({ type: 'delta', text: delta })
        }
        const clean = out.trim().replace(/^["“'•\-–—*\s]+|["”'\s]+$/g, '').replace(/\s*\n+\s*/g, ' ')
        // Same check as generation: every number and proper noun must exist in the source.
        const reasons = clean ? unsupportedClaims(clean, sources.flatMap(s => [s.content, s.title]), context) : ['empty']
        if (reasons.length > 0) {
          send({ type: 'rejected', message: REJECTED, reasons })
        } else {
          const moduleId = sources.length === 1 ? sources[0].id
            : isUuid(body?.job_id) ? [...sources].sort((a, b) => overlap(b.content, clean) - overlap(a.content, clean))[0].id
            : null
          send({ type: 'done', text: clean, module_id: moduleId })
        }
      } catch (error) {
        console.error('[rewrite-block]', error)
        send({ type: 'error', message: 'The rewrite failed. Try again.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } })
}
