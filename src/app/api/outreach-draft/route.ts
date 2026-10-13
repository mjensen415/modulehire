import { NextResponse } from 'next/server'
import { aiCompleteJson } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid, optionalString } from '@/lib/validate'
import { sanitizeCriteria } from '@/lib/dimensions'

export const maxDuration = 60

// Drafts a short, specific outreach message for a role. Copy-only: nothing is sent and nothing
// is saved — drafts are ephemeral (users copy them out).

const RECIPIENTS = ['hiring_manager', 'team_member', 'recruiter', 'mutual'] as const
const PURPOSES = ['referral', 'informational', 'follow_up'] as const
const CHANNELS = ['linkedin_note', 'message'] as const
type Recipient = typeof RECIPIENTS[number]
type Purpose = typeof PURPOSES[number]
type Channel = typeof CHANNELS[number]

const LINKEDIN_NOTE_MAX = 280
const MESSAGE_MAX_WORDS = 120

const RECIPIENT_LABEL: Record<Recipient, string> = {
  hiring_manager: 'the hiring manager for this role',
  team_member: 'someone who works on the team this role sits in',
  recruiter: 'a recruiter at the company',
  mutual: 'a mutual connection who knows people at the company',
}

const PURPOSE_ASK: Record<Purpose, string> = {
  referral: 'ask whether they would be open to referring the candidate if they think it fits',
  informational: 'ask for a 15-minute chat about the team and the work',
  follow_up: 'follow up on an application already submitted',
}

const SCHEMA = {
  type: 'object',
  properties: {
    drafts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { body: { type: 'string', description: 'The full message text, ready to paste' } },
        required: ['body'],
      },
      description: 'Exactly two distinct variants',
    },
  },
  required: ['drafts'],
}

const SYSTEM_PROMPT = `You write short job-search outreach messages for a candidate. Plain, direct, human.

Rules:
- Include exactly ONE specific, true detail from the candidate's evidence below that maps to the
  role's top requirement. Use only facts in the evidence — never invent experience, numbers,
  employers, titles, or mutual connections.
- End with ONE clear, small ask (the ask is given below). Not two asks.
- Never write "I hope this finds you well", "I hope you're doing well", "I'm passionate about",
  "I came across your profile", or any flattery about the person or company.
- No greeting fluff, no sign-off paragraphs. A first name greeting is fine if a name is given;
  otherwise start with the substance.
- Write in first person as the candidate.
- Return two variants that differ in angle or opening, not just wording.`

function trimToSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const cut = text.slice(0, maxChars)
  let lastEnd = -1
  for (const m of cut.matchAll(/[.?!](?=\s|$)/g)) lastEnd = m.index
  if (lastEnd > maxChars * 0.4) return cut.slice(0, lastEnd + 1).trim()
  // No usable sentence boundary — fall back to the last word boundary.
  return cut.slice(0, cut.lastIndexOf(' ')).trim()
}

function trimToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/)
  if (words.length <= maxWords) return text
  // Character offset of the end of the maxWords-th word, preserving original whitespace/newlines.
  let count = 0
  let end = text.length
  for (const m of text.matchAll(/\S+/g)) {
    count += 1
    if (count === maxWords) { end = m.index + m[0].length; break }
  }
  return trimToSentence(text, end)
}

// Belt-and-braces for the prompt's banned openers: drop any sentence that uses one.
const BANNED = /\b(hope (this|you're|you are|all is)\b[^.?!]*\b(well|great|good)|passionate about|came across your profile)\b/i

function cleanDraft(body: string, channel: Channel): string {
  const text = body
    .split('\n')
    .map(line => line.split(/(?<=[.?!])\s+/).filter(sentence => !BANNED.test(sentence)).join(' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return channel === 'linkedin_note' ? trimToSentence(text, LINKEDIN_NOTE_MAX) : trimToWords(text, MESSAGE_MAX_WORDS)
}

type EvidenceModule = { id: string; title: string; content: string }

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { jd_id, job_application_id } = body
    const recipient = body.recipient as Recipient
    const purpose = body.purpose as Purpose
    const channel = body.channel as Channel
    if (!isUuid(jd_id)) return NextResponse.json({ error: 'Invalid jd_id' }, { status: 400 })
    if (job_application_id != null && !isUuid(job_application_id)) return NextResponse.json({ error: 'Invalid job_application_id' }, { status: 400 })
    if (!RECIPIENTS.includes(recipient)) return NextResponse.json({ error: 'Invalid recipient' }, { status: 400 })
    if (!PURPOSES.includes(purpose)) return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 })
    if (!CHANNELS.includes(channel)) return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
    const recipientName = optionalString(body.recipient_name, 100, 'recipient_name')
    const connectionContext = optionalString(body.connection_context, 300, 'connection_context')

    const limit = await checkAndLog(supabase, user.id, 'rl_outreach', 30, 3600)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }

    const { data: jd } = await supabase
      .from('job_descriptions')
      .select('id, extracted_company, extracted_job_title, extracted_criteria, match_report')
      .eq('id', jd_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!jd) return NextResponse.json({ error: 'Job description not found' }, { status: 404 })

    // Application date for follow-ups: the given application, else the latest one for this JD.
    let appliedAt: string | null = null
    if (job_application_id) {
      const { data: app } = await supabase
        .from('job_applications')
        .select('applied_at')
        .eq('id', job_application_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
      appliedAt = app.applied_at
    } else if (purpose === 'follow_up') {
      const { data: app } = await supabase
        .from('job_applications')
        .select('applied_at')
        .eq('user_id', user.id)
        .eq('job_description_id', jd_id)
        .not('applied_at', 'is', null)
        .order('applied_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      appliedAt = app?.applied_at ?? null
    }

    // Top 3 criteria by weight × mentions — what the role actually keeps asking for.
    const criteria = sanitizeCriteria(jd.extracted_criteria)
      .sort((a, b) => b.weight * (b.mentions ?? 1) - a.weight * (a.mentions ?? 1))
      .slice(0, 3)

    // Strongest evidence: from the cached match report (best-scored criteria first), else the
    // latest match run's top-ranked modules.
    let evidenceIds: string[] = []
    const report = jd.match_report as { criteria?: Array<{ score: number; weight: number; evidence?: Array<{ id: string }> }> } | null
    if (report?.criteria?.length) {
      const seen = new Set<string>()
      for (const c of [...report.criteria].sort((a, b) => b.score * b.weight - a.score * a.weight)) {
        for (const e of c.evidence ?? []) {
          if (isUuid(e.id) && !seen.has(e.id)) { seen.add(e.id); evidenceIds.push(e.id) }
        }
      }
      evidenceIds = evidenceIds.slice(0, 3)
    }
    if (evidenceIds.length === 0) {
      const { data: run } = await supabase
        .from('match_runs')
        .select('ranked_modules')
        .eq('user_id', user.id)
        .eq('jd_id', jd_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const ranked = (Array.isArray(run?.ranked_modules) ? run.ranked_modules : []) as Array<{ module_id: string; match_score: number }>
      evidenceIds = [...ranked].sort((a, b) => b.match_score - a.match_score).map(r => r.module_id).filter(isUuid).slice(0, 3)
    }

    let evidence: EvidenceModule[] = []
    if (evidenceIds.length > 0) {
      const { data: mods } = await supabase
        .from('modules')
        .select('id, title, content')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .in('id', evidenceIds)
      evidence = evidenceIds
        .map(id => (mods ?? []).find(m => m.id === id))
        .filter((m): m is EvidenceModule => !!m)
    }
    if (evidence.length === 0) {
      return NextResponse.json({ error: 'Run a match report for this job first so we have real experience to draw from.' }, { status: 400 })
    }

    const roleLine = `${jd.extracted_job_title || 'this role'}${jd.extracted_company ? ` at ${jd.extracted_company}` : ''}`
    const lengthRule = channel === 'linkedin_note'
      ? `This is a LinkedIn connection note: ${LINKEDIN_NOTE_MAX} characters MAXIMUM including spaces. Two or three short sentences.`
      : `This is a direct message or email body: ${MESSAGE_MAX_WORDS} words MAXIMUM.`
    const followUpRule = purpose === 'follow_up'
      ? `\nThis is a FOLLOW-UP on an application${appliedAt ? ` submitted ${new Date(appliedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}` : ''}. Reference the role${appliedAt ? ' and the application date' : ''}, add one new relevant detail from the evidence, and end with a yes/no question (e.g. "Is the role still open?" or "Did my application reach the team?").`
      : ''

    const userPrompt = `ROLE: ${roleLine}
RECIPIENT: ${RECIPIENT_LABEL[recipient]}${recipientName ? ` — name: ${recipientName}` : ' — name unknown'}
${connectionContext ? `HOW THE CANDIDATE KNOWS THEM: ${connectionContext}\n` : ''}PURPOSE: ${PURPOSE_ASK[purpose]}

ROLE'S TOP REQUIREMENTS (most important first):
${criteria.length > 0 ? criteria.map((c, i) => `${i + 1}. ${c.label} — ${c.description}`).join('\n') : '(not extracted — infer from the role title only)'}

CANDIDATE EVIDENCE (the only facts you may use):
${evidence.map(m => `- ${m.title}: ${String(m.content ?? '').slice(0, 200)}`).join('\n')}

${lengthRule}${followUpRule}`

    const result = await aiCompleteJson<{ drafts: Array<{ body: unknown }> }>(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      SCHEMA,
      800,
      { tier: 'fast', userId: user.id, action: 'ai_outreach' }
    )

    const drafts = (Array.isArray(result.drafts) ? result.drafts : [])
      .map(d => (typeof d?.body === 'string' ? cleanDraft(d.body, channel) : ''))
      .filter(Boolean)
      .slice(0, 2)
      .map(b => ({ body: b }))
    if (drafts.length === 0) throw new Error('No drafts returned')

    return NextResponse.json({ drafts })
  } catch (error) {
    if (error instanceof Error && error.name === 'ValidationError') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[outreach-draft]', error)
    return NextResponse.json({ error: 'Could not draft outreach.' }, { status: 500 })
  }
}
