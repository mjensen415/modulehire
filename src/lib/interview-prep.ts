// Interview prep for one job: the user's own experience mapped to the posting's requirements.
// Shared by POST /api/interview-prep and the MCP interview_prep tool. Results are cached per JD
// for 7 days in interview_prep_cache; the plan gate (Pro only) stays with each caller.
import type { SupabaseClient } from '@supabase/supabase-js'
import { jsonrepair } from 'jsonrepair'
import { aiComplete } from '@/lib/ai'
import { getActiveProfileId } from '@/lib/profile'
import { getUserPreferences, buildPreferenceContext } from '@/lib/preferences'

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export type PrepData = {
  job_title: string
  company: string
  talking_points: Array<{ requirement: string; your_experience: string; talking_point: string }>
  personal_pitch: string
  questions_to_ask: string[]
  red_flags: string[]
}

export class InterviewPrepError extends Error {
  constructor(public code: 'not_found' | 'empty_library', message: string) {
    super(message)
  }
}

export async function getInterviewPrep(
  supabase: SupabaseClient,
  userId: string,
  jobDescriptionId: string,
  { regenerate = false }: { regenerate?: boolean } = {},
): Promise<{ prep: PrepData; generated_at: string; cached: boolean }> {
  const forceRegenerate = regenerate
  const { data: jd, error: jdError } = await supabase
    .from('job_descriptions')
    .select('id, raw_text, extracted_company, extracted_job_title')
    .eq('id', jobDescriptionId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single()
  if (jdError || !jd) throw new InterviewPrepError('not_found', 'Job description not found')

  if (!forceRegenerate) {
    const { data: cached } = await supabase
      .from('interview_prep_cache')
      .select('prep_data, generated_at')
      .eq('user_id', userId)
      .eq('job_description_id', jobDescriptionId)
      .maybeSingle()

    if (cached) {
      const age = Date.now() - new Date(cached.generated_at).getTime()
      if (age < CACHE_MAX_AGE_MS) {
        return { prep: cached.prep_data as PrepData, generated_at: cached.generated_at as string, cached: true }
      }
    }
  }

  const profileId = await getActiveProfileId(supabase, userId)
  const { data: modules, error: modulesError } = await supabase
    .from('modules')
    .select('title, content, source_company, source_role_title, weight, pinned')
    .eq('user_id', userId)
    .eq('profile_id', profileId)
    .is('deleted_at', null)
    .order('weight', { ascending: true })
  if (modulesError) throw modulesError

  const weightOrder: Record<string, number> = { anchor: 0, strong: 1, supporting: 2 }
  const sortedModules = [...(modules ?? [])].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return (weightOrder[a.weight] ?? 3) - (weightOrder[b.weight] ?? 3)
  })

  let resumeContent = ''
  for (const m of sortedModules) {
    const chunk = `- ${m.title}${m.source_company ? ` (${m.source_company}${m.source_role_title ? `, ${m.source_role_title}` : ''})` : ''}: ${m.content}\n`
    if (resumeContent.length + chunk.length > 10_000) break
    resumeContent += chunk
  }

  if (!resumeContent.trim()) {
    throw new InterviewPrepError('empty_library', 'Add some modules to your library before generating prep.')
  }

  const jobTitle = jd.extracted_job_title || 'this role'
  const company = jd.extracted_company || 'this company'

  const prefs = await getUserPreferences(supabase, userId)
  const prefContext = buildPreferenceContext(prefs)

  // Cacheable prefix: this profile's module library, unchanged across different JDs prepped
  // for in the same session.
  const libraryBlock = `You are helping a job candidate prepare for an interview. Surface THEIR OWN experience in the context of a job description — do not write answers for them, just help them see the connections.

CANDIDATE'S EXPERIENCE (from their resume/module library):
${resumeContent}
`

  const taskBlock = `${prefContext ? prefContext + '\n\n' : ''}JOB TITLE: ${jobTitle}
COMPANY: ${company}

JOB DESCRIPTION:
${jd.raw_text.slice(0, 12_000)}

Extract 5-7 key requirements from the job description. For each, identify the most relevant experience from the candidate's background above and suggest a brief framing for how to talk about it — guidance, not a script.

Return ONLY a valid JSON object — no explanation, no markdown, no code fences:
{
  "job_title": "${jobTitle}",
  "company": "${company}",
  "talking_points": [
    {
      "requirement": "what the JD asks for",
      "your_experience": "the specific relevant experience from their background",
      "talking_point": "1-2 sentence suggested framing — focus on X, mention Y — not a script"
    }
  ],
  "personal_pitch": "2-3 sentence summary of why they're a strong fit, grounded in their actual experience",
  "questions_to_ask": ["3-5 thoughtful questions to ask the interviewer, based on the JD"],
  "red_flags": ["gaps between JD requirements and their resume, so they can prepare honest answers — empty array if none"]
}`

  const raw = await aiComplete(
    [{ role: 'user', content: [{ text: libraryBlock, cache: true }, { text: taskBlock }] }],
    2048,
    { tier: 'quality', action: 'ai_interview_prep', userId }
  )
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  const jsonStr = cleaned.startsWith('{') ? cleaned : cleaned.slice(cleaned.indexOf('{'))
  const prep = JSON.parse(jsonrepair(jsonStr)) as PrepData

  const generatedAt = new Date().toISOString()
  const { error: upsertError } = await supabase
    .from('interview_prep_cache')
    .upsert(
      { user_id: userId, job_description_id: jobDescriptionId, prep_data: prep, generated_at: generatedAt },
      { onConflict: 'user_id,job_description_id' }
    )
  if (upsertError) throw upsertError

  return { prep, generated_at: generatedAt, cached: false }
}
