// Accomplishments out of a performance review, brag doc or other document (POST /api/parse-document).
// Haiku, one call, forced JSON. Every module gets the verbatim line it came from; a module whose
// text names a number or name the document doesn't contain is cut back to that line, or dropped.
import { aiCompleteJson } from './ai'
import { DIMENSIONS, isDimension } from './dimensions'
import { unsupportedTerms } from './fact-check'
import { sourceKeyFor, verifiedQuote } from './parse-modules'
import type { ImportKind } from './documents'

export type ParsedAccomplishment = {
  type: 'experience' | 'story' | 'skill'
  title: string
  content: string
  source_quote: string | null
  weight: 'anchor' | 'strong' | 'supporting'
  dimensions: string[]
}

const SCHEMA = {
  type: 'object',
  properties: {
    modules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['experience', 'story', 'skill'] },
          title: { type: 'string', description: 'Short skill-domain name, 2-5 words' },
          content: { type: 'string', description: '1-3 sentences, third person past tense, every number copied exactly' },
          source_quote: { type: 'string', description: 'The shortest span copied character for character from the document that supports it' },
          weight: { type: 'string', enum: ['anchor', 'strong', 'supporting'] },
          dimensions: { type: 'array', items: { type: 'string', enum: DIMENSIONS as unknown as string[] } },
        },
        required: ['type', 'title', 'content', 'source_quote', 'weight', 'dimensions'],
      },
    },
  },
  required: ['modules'],
}

const KIND_NOUN: Record<ImportKind, string> = {
  performance_review: 'performance review',
  brag_doc: 'brag document (a list of the person\'s own wins)',
  other: 'career document (for example a LinkedIn export)',
}

function prompt(kind: ImportKind, job: { company: string; title: string | null }): string {
  return `You turn a ${KIND_NOUN[kind]} into resume modules for the person it is about. They worked as ${job.title ?? 'an employee'} at ${job.company}.

Extract concrete accomplishments only: things the person did, with an outcome, a scope, or a deliverable.
SKIP:
- ratings and scores ("exceeds expectations", "4/5", "strong performer")
- manager opinions with no outcome ("great collaborator", "a pleasure to work with")
- goals, plans and development areas that are not done yet ("next year, will lead…", "should improve…")
- the reviewer's own work, company-wide results the person didn't drive, and boilerplate

RULES:
- One module per accomplishment. Usually 4 to 8 for a review; fewer is fine when the document has fewer.
- content: 1-3 sentences, third person past tense ("Led…", "Cut…"). Copy every number, percentage, team size and name exactly as written. Add nothing the document doesn't say.
- source_quote: copy, character for character, the shortest span of the document that supports the module (one sentence or bullet). No rewording, no joining distant lines.
- weight: "anchor" for the one or two biggest results, "strong" for clear wins, "supporting" for smaller ones.
- dimensions: 1-3 of role, seniority, responsibility, skill, domain, collaboration.

WORKED EXAMPLE
Document lines:
  "Rating: Exceeds expectations in collaboration."
  "Priya led the migration of 3 regional forums to the new platform, finishing two weeks early."
  "Next year Priya will own the APAC launch."
Modules:
[{"type":"story","title":"Forum Migration","content":"Led the migration of 3 regional forums to the new platform, finishing two weeks early.","source_quote":"led the migration of 3 regional forums to the new platform, finishing two weeks early","weight":"anchor","dimensions":["responsibility"]}]
The rating and the APAC plan are not modules.`
}

export async function parseAccomplishments(
  rawText: string,
  kind: ImportKind,
  job: { company: string; title: string | null },
  userId: string,
): Promise<ParsedAccomplishment[]> {
  const run = (temperature?: number) => aiCompleteJson<{ modules: unknown }>(
    [
      { role: 'system', content: 'You extract concrete, verifiable accomplishments from career documents.' },
      { role: 'user', content: [{ text: prompt(kind, job) }, { text: `Document:\n${rawText.slice(0, 60_000)}` }] },
    ],
    SCHEMA,
    3200,
    { tier: 'fast', userId, action: 'ai_parse_review', ...(temperature !== undefined ? { temperature } : {}) },
  )
  let out = clean(await run(), rawText, job)
  // One retry at temperature 0 when a real document returned nothing.
  if (out.length === 0 && rawText.replace(/\s+/g, '').length > 400) out = clean(await run(0), rawText, job)
  return out
}

function clean(res: { modules: unknown }, rawText: string, job: { company: string; title: string | null }): ParsedAccomplishment[] {
  const list = Array.isArray(res?.modules) ? res.modules : []
  const key = sourceKeyFor(rawText)
  const context = [job.company, job.title ?? '']
  const out: ParsedAccomplishment[] = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const m = raw as Record<string, unknown>
    const title = typeof m.title === 'string' ? m.title.trim().slice(0, 120) : ''
    let content = typeof m.content === 'string' ? m.content.trim() : ''
    if (!title || !content) continue
    const quote = verifiedQuote(m.source_quote, key)
    // Nothing the document doesn't support: fall back to the quote itself, or drop it.
    if (unsupportedTerms(content, [rawText], context).length > 0) {
      if (!quote) continue
      content = quote
    }
    out.push({
      type: m.type === 'story' || m.type === 'skill' ? m.type : 'experience',
      title,
      content: content.slice(0, 2000),
      source_quote: quote,
      weight: m.weight === 'anchor' || m.weight === 'strong' ? m.weight : 'supporting',
      dimensions: (Array.isArray(m.dimensions) ? m.dimensions : []).filter(isDimension).slice(0, 3),
    })
  }
  return out
}
