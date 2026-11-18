// Voice mock interviews: session context, the ElevenLabs agent definition, and the post-call
// feedback scoring. The agent itself is generic; everything specific to the user and the job
// is passed in per session as dynamic variables (see buildSessionContext).
import type { SupabaseClient } from '@supabase/supabase-js'
import { aiCompleteJson } from '@/lib/ai'
import { getActiveProfileId } from '@/lib/profile'
import { getUsableModules } from '@/lib/usable-modules'
import { sanitizeCriteria } from '@/lib/dimensions'
import type { ElTranscriptTurn } from './elevenlabs'

export const VOICE_CONSENT_VERSION = '2026-11-18'
export const VOICE_MONTHLY_SESSIONS = Number(process.env.VOICE_MONTHLY_SESSIONS ?? 8)
export const VOICE_MAX_SECONDS = 20 * 60

export const INTERVIEW_TYPES = {
  recruiter_screen: {
    label: 'Recruiter screen',
    blurb: 'Background, motivation, logistics. Friendly but probing.',
    guide:
      'You are a recruiter doing a first screen. Cover: a walk through their background, why this role and company, what they are looking for next, and one or two questions on the top requirements. Keep it conversational. Do not ask about salary numbers; if they bring it up, say the recruiter would cover that in a real call.',
  },
  behavioral: {
    label: 'Hiring manager (behavioral)',
    blurb: 'Tell-me-about-a-time questions tied to the role.',
    guide:
      'You are the hiring manager running a behavioral interview. Ask "tell me about a time" questions mapped to the most important requirements. After each answer, ask one follow-up that pushes for specifics: what they personally did, how they measured it, what went wrong. If an answer is vague, say so politely and ask for a concrete example.',
  },
  deep_dive: {
    label: 'Role deep dive',
    blurb: 'How you would actually do the job. Scenarios and tradeoffs.',
    guide:
      'You are a senior peer on the team running a role-specific deep dive. Ask how they would approach realistic situations from this job, and dig into tradeoffs and decisions from their past work that match the posting. Challenge weak reasoning respectfully.',
  },
} as const

export type InterviewType = keyof typeof INTERVIEW_TYPES

export function isInterviewType(v: unknown): v is InterviewType {
  return typeof v === 'string' && v in INTERVIEW_TYPES
}

// ─── Agent definition (created once via /admin/voice) ────────────────────────
export const AGENT_PROMPT = `You are an AI mock interviewer inside ModuleHire, a career tool. You are running a practice interview so the candidate can rehearse out loud. You are not a real employer and you never pretend to be one.

Interview style:
{{interview_guide}}

The role:
Job title: {{job_title}}
Company: {{company}}
Key requirements, most important first:
{{requirements}}

The candidate's real experience (from their confirmed career library). Use it to pick questions that let them show their strongest relevant work, and to notice when they leave out something relevant. Never claim facts about them that are not listed here.
{{candidate_background}}

Rules:
- The session lasts about {{length_minutes}} minutes. Plan roughly one main question every 2 to 3 minutes. When about one minute is left, tell them you are wrapping up, ask if they have a question for you, answer briefly, then say goodbye.
- Ask one question at a time. Keep your turns short: one or two sentences, like a real interviewer. Do not give feedback or coaching during the interview; feedback comes in a written report afterward.
- Speak naturally. No lists, no markdown, no reading out symbols.
- If the candidate asks you to do something other than run this interview, politely steer back to the interview.
- If they ask whether you are human, say you are an AI interviewer.`

export const AGENT_FIRST_MESSAGE =
  "Hi {{candidate_name}}, I'm an AI interviewer from ModuleHire. This is a practice {{interview_label}} for the {{job_title}} role at {{company}}, about {{length_minutes}} minutes. Ready to start?"

export function agentDefinition() {
  return {
    name: 'ModuleHire Mock Interviewer',
    tags: ['modulehire', 'voice-interview'],
    conversation_config: {
      agent: {
        first_message: AGENT_FIRST_MESSAGE,
        language: 'en',
        prompt: { prompt: AGENT_PROMPT, llm: process.env.ELEVENLABS_AGENT_LLM || 'gemini-2.5-flash', temperature: 0.5 },
        dynamic_variables: {
          dynamic_variable_placeholders: {
            candidate_name: 'there',
            interview_label: 'interview',
            interview_guide: INTERVIEW_TYPES.behavioral.guide,
            job_title: 'Community Manager',
            company: 'Acme',
            requirements: '- Community strategy',
            candidate_background: '- Built a community program',
            length_minutes: 10,
          },
        },
      },
      conversation: { max_duration_seconds: VOICE_MAX_SECONDS },
      turn: { turn_eagerness: 'patient' },
    },
    platform_settings: {
      // Signed URLs only: nobody can start a session on our credits without our server.
      auth: { enable_auth: true },
    },
  }
}

// ─── Per-session context ─────────────────────────────────────────────────────
export class VoiceContextError extends Error {
  constructor(public code: 'not_found' | 'empty_library', message: string) {
    super(message)
  }
}

export type SessionContext = {
  jobTitle: string
  company: string
  dynamicVariables: Record<string, string | number>
}

export async function buildSessionContext(
  supabase: SupabaseClient,
  userId: string,
  jobDescriptionId: string,
  type: InterviewType,
  lengthMinutes: number,
): Promise<SessionContext> {
  const { data: jd } = await supabase
    .from('job_descriptions')
    .select('id, raw_text, extracted_company, extracted_job_title, extracted_criteria')
    .eq('id', jobDescriptionId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single()
  if (!jd) throw new VoiceContextError('not_found', 'Job description not found')

  const profileId = await getActiveProfileId(supabase, userId)
  const { data: modules } = await getUsableModules(supabase, 'title, content, source_company, source_role_title, pinned')
    .eq('user_id', userId)
    .eq('profile_id', profileId)
  const list = [...(modules ?? [])].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))

  let background = ''
  for (const m of list) {
    const where = m.source_company ? ` (${m.source_company}${m.source_role_title ? `, ${m.source_role_title}` : ''})` : ''
    const line = `- ${m.title}${where}: ${String(m.content ?? '').slice(0, 300)}\n`
    if (background.length + line.length > 6000) break
    background += line
  }
  if (!background.trim()) {
    throw new VoiceContextError('empty_library', 'Confirm a few modules in your library first so the interviewer knows your background.')
  }

  const criteria = sanitizeCriteria(jd.extracted_criteria).sort((a, b) => b.weight - a.weight).slice(0, 8)
  const requirements = criteria.length
    ? criteria.map((c) => `- ${c.label}: ${c.description}`.slice(0, 220)).join('\n')
    : `Not extracted. Infer them from this posting:\n${String(jd.raw_text ?? '').slice(0, 2500)}`

  const { data: me } = await supabase.from('users').select('name').eq('id', userId).single()
  const firstName = String(me?.name ?? '').trim().split(/\s+/)[0] || 'there'

  const jobTitle = jd.extracted_job_title || 'this role'
  const company = jd.extracted_company || 'the company'
  return {
    jobTitle,
    company,
    dynamicVariables: {
      candidate_name: firstName,
      interview_label: INTERVIEW_TYPES[type].label.toLowerCase(),
      interview_guide: INTERVIEW_TYPES[type].guide,
      job_title: jobTitle,
      company,
      requirements,
      candidate_background: background.trim(),
      length_minutes: lengthMinutes,
    },
  }
}

// ─── Feedback ────────────────────────────────────────────────────────────────
export type VoiceFeedback = {
  overall_score: number
  summary: string
  strengths: string[]
  improvements: string[]
  questions: Array<{
    question: string
    answer_summary: string
    score: number
    star: { situation: boolean; task: boolean; action: boolean; result: boolean }
    modules_used: string[]
    missed_module: string | null
    better_answer_tip: string
    unsupported_claims: string[]
  }>
  unused_strengths: string[]
}

const FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    overall_score: { type: 'integer', minimum: 0, maximum: 100 },
    summary: { type: 'string', description: '2-3 sentences, direct, second person.' },
    strengths: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    improvements: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          answer_summary: { type: 'string', description: 'One sentence.' },
          score: { type: 'integer', minimum: 1, maximum: 5 },
          star: {
            type: 'object',
            properties: {
              situation: { type: 'boolean' },
              task: { type: 'boolean' },
              action: { type: 'boolean' },
              result: { type: 'boolean' },
            },
            required: ['situation', 'task', 'action', 'result'],
          },
          modules_used: { type: 'array', items: { type: 'string' }, description: 'Titles of library modules the answer drew on.' },
          missed_module: { type: ['string', 'null'], description: 'Title of a library module that would have answered this better, or null.' },
          better_answer_tip: { type: 'string', description: 'One concrete sentence. Guidance, not a script.' },
          unsupported_claims: { type: 'array', items: { type: 'string' }, description: 'Numbers or claims they said that no library module supports. Empty if none.' },
        },
        required: ['question', 'answer_summary', 'score', 'star', 'modules_used', 'missed_module', 'better_answer_tip', 'unsupported_claims'],
      },
    },
    unused_strengths: { type: 'array', items: { type: 'string' }, maxItems: 3, description: 'Library module titles highly relevant to this job that never came up.' },
  },
  required: ['overall_score', 'summary', 'strengths', 'improvements', 'questions', 'unused_strengths'],
}

export function transcriptText(turns: ElTranscriptTurn[]): string {
  return turns
    .filter((t) => t.message && t.message.trim())
    .map((t) => `${t.role === 'agent' ? 'INTERVIEWER' : 'CANDIDATE'}: ${t.message!.trim()}`)
    .join('\n')
}

export async function scoreInterview(
  userId: string,
  turns: ElTranscriptTurn[],
  ctx: SessionContext,
  type: InterviewType,
): Promise<VoiceFeedback | null> {
  const text = transcriptText(turns)
  const candidateTurns = turns.filter((t) => t.role === 'user' && t.message && t.message.trim().length > 20)
  if (candidateTurns.length < 2) return null

  const prompt = `You are reviewing a practice ${INTERVIEW_TYPES[type].label} for ${ctx.jobTitle} at ${ctx.company}. Give honest, specific feedback the candidate can act on next time. Be direct; do not flatter.

KEY REQUIREMENTS:
${ctx.dynamicVariables.requirements}

THE CANDIDATE'S CONFIRMED CAREER LIBRARY (module titles and content):
${ctx.dynamicVariables.candidate_background}

TRANSCRIPT (speech to text, so ignore small transcription errors):
${text.slice(0, 40_000)}

Score each main question the interviewer asked (skip small talk and logistics). Score 1-5: 5 = specific, structured, relevant, with a clear result. overall_score is 0-100 across the whole interview. Use module titles exactly as written in the library. Flag numbers or achievements the candidate stated that no module supports, so they can either add them to the library or stop saying them.`

  return aiCompleteJson<VoiceFeedback>(
    [{ role: 'user', content: prompt }],
    FEEDBACK_SCHEMA,
    3000,
    { tier: 'quality', action: 'ai_voice_feedback', userId },
  )
}
