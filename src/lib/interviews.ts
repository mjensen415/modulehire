// Interviews: rounds read from an interview email, practice questions for a round, and graded
// practice answers. All Haiku, all forced JSON. The "tighter version" of an answer may only use
// facts from the user's own answer and their confirmed modules (same number/name check as
// resume generation).
import type { SupabaseClient } from '@supabase/supabase-js'
import { aiCompleteJson } from './ai'
import { stripUnsupportedSentences } from './fact-check'
import { isProTier } from './plan'
import { isUuid } from './validate'

export const FORMATS = ['phone', 'video', 'onsite'] as const
export type Interviewer = { name: string; title: string | null }

// ─── From an interview email ─────────────────────────────────────────────────

export type EmailExtract = {
  company: string | null
  job_title: string | null
  round_name: string
  scheduled_at: string | null // ISO 8601 with offset, or null when the email doesn't give one
  format: typeof FORMATS[number] | null
  interviewers: Interviewer[]
  notes: string | null
}

const EMAIL_SCHEMA = {
  type: 'object',
  properties: {
    company: { type: 'string', description: 'Hiring company, or empty string' },
    job_title: { type: 'string', description: 'Role being interviewed for, or empty string' },
    round_name: { type: 'string', description: 'Short round name, e.g. "Phone screen", "Hiring manager", "Panel", "Technical", "Final"' },
    scheduled_at: { type: 'string', description: 'Start time as ISO 8601 with UTC offset (e.g. 2026-11-24T14:00:00-08:00), or empty string if no single confirmed time' },
    format: { type: 'string', enum: ['phone', 'video', 'onsite', ''] },
    interviewers: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, title: { type: 'string' } }, required: ['name', 'title'] } },
    notes: { type: 'string', description: 'Logistics worth keeping: meeting link, address, what to prepare. Empty string if none.' },
  },
  required: ['company', 'job_title', 'round_name', 'scheduled_at', 'format', 'interviewers', 'notes'],
}

export async function extractInterviewFromEmail(email: string, userId: string, now = new Date()): Promise<EmailExtract> {
  const raw = await aiCompleteJson<Record<string, unknown>>(
    [
      { role: 'system', content: 'You read interview scheduling emails and pull out the facts. You never guess.' },
      {
        role: 'user',
        content: `Today is ${now.toISOString().slice(0, 10)}. Read this interview email and fill in the fields.
- Only use what the email says. If a time is offered as several options, or not confirmed, leave scheduled_at empty.
- Resolve relative dates ("next Tuesday") from today's date. Use the time zone the email names; if none, use -05:00 and say so in notes.
- interviewers: people the candidate will meet (not the recruiter sending the email, unless they run the interview). Empty title if not given.
- format: phone, video (Zoom, Meet, Teams, a video link) or onsite; empty if unclear.

WORKED EXAMPLE
Email: "Hi Sam, thanks for your time! Next up is a 45-minute video call with Dana Ruiz (Director of Community) on Thursday Nov 20 at 1:00pm PT. Zoom link: zoom.us/j/123. — Leah, Recruiting at Brightline"
Result: {"company":"Brightline","job_title":"","round_name":"Hiring manager","scheduled_at":"2026-11-20T13:00:00-08:00","format":"video","interviewers":[{"name":"Dana Ruiz","title":"Director of Community"}],"notes":"45 minutes. Zoom: zoom.us/j/123"}

Email:
${email.slice(0, 12_000)}`,
      },
    ],
    EMAIL_SCHEMA,
    700,
    { tier: 'fast', userId, action: 'ai_interview_email' },
  )
  const str = (v: unknown) => cleanField(v, 4000) || null
  const when = str(raw.scheduled_at)
  const parsed = when ? new Date(when) : null
  return {
    company: str(raw.company),
    job_title: str(raw.job_title),
    round_name: (str(raw.round_name) ?? 'Interview').slice(0, 80),
    scheduled_at: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
    format: FORMATS.includes(raw.format as typeof FORMATS[number]) ? raw.format as typeof FORMATS[number] : null,
    interviewers: cleanInterviewers(raw.interviewers),
    notes: str(raw.notes)?.slice(0, 2000) ?? null,
  }
}

export function cleanInterviewers(v: unknown): Interviewer[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map(p => ({ name: String(p.name ?? '').trim().slice(0, 120), title: String(p.title ?? '').trim().slice(0, 120) || null }))
    .filter(p => p.name)
    .slice(0, 12)
}

/** Validated interview fields from a request body (shared with PATCH). */
export function interviewFields(body: Record<string, unknown>, partial: boolean): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string } {
  const f: Record<string, unknown> = {}
  if (!partial || 'round_name' in body) {
    const name = typeof body.round_name === 'string' ? body.round_name.trim().slice(0, 80) : ''
    if (!name) return { ok: false, error: 'Give the round a name, like "Phone screen".' }
    f.round_name = name
  }
  if ('scheduled_at' in body) {
    if (body.scheduled_at === null || body.scheduled_at === '') f.scheduled_at = null
    else {
      const d = new Date(String(body.scheduled_at))
      if (Number.isNaN(d.getTime())) return { ok: false, error: 'That date and time could not be read.' }
      f.scheduled_at = d.toISOString()
    }
  }
  if ('format' in body) f.format = FORMATS.includes(body.format as typeof FORMATS[number]) ? body.format : null
  if ('interviewers' in body) f.interviewers = cleanInterviewers(body.interviewers)
  if ('notes' in body) f.notes = typeof body.notes === 'string' ? body.notes.slice(0, 4000) || null : null
  if ('job_application_id' in body) f.job_application_id = isUuid(body.job_application_id) ? body.job_application_id : null
  return { ok: true, fields: f }
}


// ─── Practice questions for a round ──────────────────────────────────────────

export type PracticeQuestion = { question: string; why: string }

const QUESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: { type: 'object', properties: { question: { type: 'string' }, why: { type: 'string', description: 'One short line: what this question is really checking' } }, required: ['question', 'why'] },
    },
  },
  required: ['questions'],
}

export async function practiceQuestionsFor(
  round: { round_name: string; format: string | null; interviewers: Interviewer[] },
  job: { title: string | null; company: string | null; posting: string | null },
  userId: string,
): Promise<PracticeQuestion[]> {
  const people = round.interviewers.map(i => `${i.name}${i.title ? ` (${i.title})` : ''}`).join(', ')
  const res = await aiCompleteJson<{ questions: unknown }>(
    [
      { role: 'system', content: 'You are an experienced interviewer helping a candidate practice.' },
      {
        role: 'user',
        content: `Write 10 questions this candidate is likely to hear in this round. Match the round: a phone or recruiter screen asks about motivation, background and logistics; a hiring-manager round goes deep on past work and judgment; a panel mixes collaboration and scenario questions; a technical or case round asks them to work through a problem; a final round asks about leadership, values and fit.
Round: ${round.round_name}${round.format ? ` (${round.format})` : ''}${people ? `. Interviewers: ${people}` : ''}
Role: ${job.title ?? 'not given'} at ${job.company ?? 'not given'}
${job.posting ? `Job posting (for what they will care about):\n${job.posting.slice(0, 6000)}` : ''}
Make each question specific to this role where the posting allows. One sentence each. No numbering.`,
      },
    ],
    QUESTIONS_SCHEMA,
    1400,
    { tier: 'fast', userId, action: 'ai_interview_questions' },
  )
  const list = Array.isArray(res?.questions) ? res.questions : []
  return list
    .filter((q): q is Record<string, unknown> => !!q && typeof q === 'object' && typeof q.question === 'string')
    .map(q => ({ question: cleanField(q.question, 400), why: cleanField(q.why, 200) }))
    .filter(q => q.question.length > 8)
    .slice(0, 12)
}

// ─── Grading a practice answer ───────────────────────────────────────────────

export type PracticeFeedback = {
  scores: { structure: number; specificity: number; relevance: number; length: number }
  strongest_part: string
  one_fix: string
  suggested_story: { module_id: string; title: string; why: string } | null
  tighter_version: string | null
  /** Sentences the fact check removed from the tighter version. */
  removed?: string[]
}

const FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'object',
      properties: {
        structure: { type: 'integer', minimum: 1, maximum: 5 },
        specificity: { type: 'integer', minimum: 1, maximum: 5 },
        relevance: { type: 'integer', minimum: 1, maximum: 5 },
        length: { type: 'integer', minimum: 1, maximum: 5 },
      },
      required: ['structure', 'specificity', 'relevance', 'length'],
    },
    strongest_part: { type: 'string' },
    one_fix: { type: 'string' },
    suggested_story: {
      type: 'object',
      properties: { ref: { type: 'string', description: 'A module ref like m3, or empty string if none fits' }, why: { type: 'string' } },
      required: ['ref', 'why'],
    },
    tighter_version: { type: 'string' },
  },
  required: ['scores', 'strongest_part', 'one_fix', 'suggested_story', 'tighter_version'],
}

type ModuleLite = { id: string; title: string; content: string }

// Forced tool use occasionally leaks markup into a string field ("…</fix>\n<parameter name=…").
// Cut a field at the first tag-like fragment so it never reaches the page.
export function cleanField(v: unknown, max: number): string {
  const text = typeof v === 'string' ? v : ''
  const cut = text.search(/<\/?[a-z_]+[^>]*>|<parameter\b/i)
  return (cut >= 0 ? text.slice(0, cut) : text).trim().slice(0, max)
}

export async function gradePracticeAnswer(
  input: { question: string; answer: string; round_name: string; job_title: string | null; company: string | null },
  modules: ModuleLite[],
  userId: string,
): Promise<PracticeFeedback> {
  const listed = modules.slice(0, 40)
  const refList = listed.map((m, i) => `m${i + 1} | ${m.title} | ${m.content.slice(0, 220).replace(/\s+/g, ' ')}`).join('\n')
  const res = await aiCompleteJson<Record<string, unknown>>(
    [
      { role: 'system', content: 'You coach interview answers. You are direct, specific and kind. You never invent facts about the candidate.' },
      {
        role: 'user',
        content: `Grade this practice answer for a ${input.round_name} for ${input.job_title ?? 'the role'}${input.company ? ` at ${input.company}` : ''}.

Scores, 1 to 5:
- structure: a clear situation, action, result arc (or a direct answer for a factual question)
- specificity: concrete actions, numbers, names, outcomes rather than generalities
- relevance: answers the question asked and connects to this role
- length: 5 = about 60 to 120 seconds spoken (roughly 150 to 300 words); shorter or rambling scores lower
strongest_part: one sentence naming what works, quoting a few of their words.
one_fix: the single change that would most improve it, as an instruction.
suggested_story: the module from their library below that would make the strongest example for this question (its ref), and why in one sentence. Empty ref if none fits.
tighter_version: rewrite the answer to be tighter and better structured, in first person. Use ONLY facts stated in their answer or in the suggested module. Do not add numbers, names, tools or outcomes that neither contains. Keep it under 220 words.

Their confirmed modules:
${refList || '(none)'}

Question: ${input.question}

Their answer:
${input.answer.slice(0, 6000)}`,
      },
    ],
    FEEDBACK_SCHEMA,
    1200,
    { tier: 'fast', userId, action: 'ai_practice_feedback' },
  )

  const clamp = (v: unknown) => Math.max(1, Math.min(5, Math.round(Number(v) || 1)))
  const s = (res.scores ?? {}) as Record<string, unknown>
  const story = (res.suggested_story ?? {}) as Record<string, unknown>
  const refIdx = typeof story.ref === 'string' ? Number(story.ref.replace(/^m/i, '')) - 1 : -1
  const picked = Number.isInteger(refIdx) && refIdx >= 0 && refIdx < listed.length ? listed[refIdx] : null

  // The tighter version may only use facts from the answer and the confirmed modules.
  let tighter = cleanField(res.tighter_version, 3000)
  let removed: string[] = []
  if (tighter) {
    const sources = [input.answer, ...listed.map(m => `${m.title}\n${m.content}`)]
    const checked = stripUnsupportedSentences(tighter, sources, [input.company ?? '', input.job_title ?? ''])
    tighter = checked.text.trim()
    removed = checked.removed.map(r => r.sentence)
  }

  return {
    scores: { structure: clamp(s.structure), specificity: clamp(s.specificity), relevance: clamp(s.relevance), length: clamp(s.length) },
    strongest_part: dropRefs(cleanField(res.strongest_part, 500)),
    one_fix: dropRefs(cleanField(res.one_fix, 500)),
    suggested_story: picked ? { module_id: picked.id, title: picked.title, why: dropRefs(cleanField(story.why, 300)) } : null,
    tighter_version: tighter.length >= 20 ? tighter : null,
    ...(removed.length ? { removed } : {}),
  }
}

// "m3 captures…" → "This module captures…": the short refs are internal.
function dropRefs(text: string): string {
  return text.replace(/\b[Mm]\d{1,2}\b/g, 'this module').replace(/^this module/, 'This module')
}

// ─── Limits ──────────────────────────────────────────────────────────────────
// Free: one practice round (graded answers on one interview, up to FREE_ANSWERS_PER_ROUND).
// Paid: any round, fair use PAID_GRADED_PER_30_DAYS graded answers per 30 days.

export const FREE_ANSWERS_PER_ROUND = 15
export const PAID_GRADED_PER_30_DAYS = 60

export async function practiceAllowed(
  supabase: SupabaseClient,
  userId: string,
  tier: string | null | undefined,
  interviewId: string,
): Promise<{ ok: true } | { ok: false; code: 'PRACTICE_LIMIT_REACHED' | 'PRACTICE_FAIR_USE'; message: string }> {
  if (isProTier(tier)) {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const { count } = await supabase.from('practice_answers').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since)
    return (count ?? 0) < PAID_GRADED_PER_30_DAYS
      ? { ok: true }
      : { ok: false, code: 'PRACTICE_FAIR_USE', message: `You've had ${PAID_GRADED_PER_30_DAYS} answers graded in the last 30 days, the fair-use limit.` }
  }
  const { data } = await supabase.from('practice_answers').select('interview_id').eq('user_id', userId).limit(500)
  // A deleted round's answers keep interview_id = null and still count as the one Free round.
  const rounds = new Set((data ?? []).map(r => r.interview_id ?? 'deleted'))
  if (rounds.size > 0 && !rounds.has(interviewId)) {
    return { ok: false, code: 'PRACTICE_LIMIT_REACHED', message: 'The Free plan includes one practice round. Start a 30-day Sprint to practice for every round.' }
  }
  const onThis = (data ?? []).filter(r => r.interview_id === interviewId).length
  return onThis < FREE_ANSWERS_PER_ROUND
    ? { ok: true }
    : { ok: false, code: 'PRACTICE_LIMIT_REACHED', message: 'You have used the Free practice round. Start a 30-day Sprint for unlimited practice.' }
}
