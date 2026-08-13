import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aiComplete } from '@/lib/ai'
import { jsonrepair } from 'jsonrepair'
import { isProTier } from '@/lib/plan'
import { isUuid } from '@/lib/validate'

export const maxDuration = 60

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

type PrepData = {
  job_title: string
  company: string
  talking_points: Array<{ requirement: string; your_experience: string; talking_point: string }>
  personal_pitch: string
  questions_to_ask: string[]
  red_flags: string[]
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('tier')
      .eq('id', user.id)
      .single()
    if (!isProTier(profile?.tier)) {
      return NextResponse.json({ error: 'pro_required' }, { status: 403 })
    }

    const body = await req.json()
    const jobDescriptionId = body?.job_description_id
    if (!isUuid(jobDescriptionId)) {
      return NextResponse.json({ error: 'Invalid job_description_id' }, { status: 400 })
    }
    const forceRegenerate = !!body?.regenerate

    const { data: jd, error: jdError } = await supabase
      .from('job_descriptions')
      .select('id, raw_text, extracted_company, extracted_job_title')
      .eq('id', jobDescriptionId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()
    if (jdError || !jd) return NextResponse.json({ error: 'Job description not found' }, { status: 404 })

    if (!forceRegenerate) {
      const { data: cached } = await supabase
        .from('interview_prep_cache')
        .select('prep_data, generated_at')
        .eq('user_id', user.id)
        .eq('job_description_id', jobDescriptionId)
        .maybeSingle()

      if (cached) {
        const age = Date.now() - new Date(cached.generated_at).getTime()
        if (age < CACHE_MAX_AGE_MS) {
          return NextResponse.json({ prep: cached.prep_data, generated_at: cached.generated_at, cached: true })
        }
      }
    }

    const { data: modules, error: modulesError } = await supabase
      .from('modules')
      .select('title, content, source_company, source_role_title, weight')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('weight', { ascending: true })
    if (modulesError) throw modulesError

    const weightOrder: Record<string, number> = { anchor: 0, strong: 1, supporting: 2 }
    const sortedModules = [...(modules ?? [])].sort((a, b) => (weightOrder[a.weight] ?? 3) - (weightOrder[b.weight] ?? 3))

    let resumeContent = ''
    for (const m of sortedModules) {
      const chunk = `- ${m.title}${m.source_company ? ` (${m.source_company}${m.source_role_title ? `, ${m.source_role_title}` : ''})` : ''}: ${m.content}\n`
      if (resumeContent.length + chunk.length > 10_000) break
      resumeContent += chunk
    }

    if (!resumeContent.trim()) {
      return NextResponse.json({ error: 'Add some modules to your library before generating prep.' }, { status: 400 })
    }

    const jobTitle = jd.extracted_job_title || 'this role'
    const company = jd.extracted_company || 'this company'

    const prompt = `You are helping a job candidate prepare for an interview. Surface THEIR OWN experience in the context of this job description — do not write answers for them, just help them see the connections.

JOB TITLE: ${jobTitle}
COMPANY: ${company}

JOB DESCRIPTION:
${jd.raw_text.slice(0, 12_000)}

CANDIDATE'S EXPERIENCE (from their resume/module library):
${resumeContent}

Extract 5-7 key requirements from the job description. For each, identify the most relevant experience from the candidate's background and suggest a brief framing for how to talk about it — guidance, not a script.

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

    const raw = await aiComplete([{ role: 'user', content: prompt }], 2048)
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const jsonStr = cleaned.startsWith('{') ? cleaned : cleaned.slice(cleaned.indexOf('{'))
    const prep = JSON.parse(jsonrepair(jsonStr)) as PrepData

    const generatedAt = new Date().toISOString()
    const { error: upsertError } = await supabase
      .from('interview_prep_cache')
      .upsert(
        { user_id: user.id, job_description_id: jobDescriptionId, prep_data: prep, generated_at: generatedAt },
        { onConflict: 'user_id,job_description_id' }
      )
    if (upsertError) throw upsertError

    return NextResponse.json({ prep, generated_at: generatedAt, cached: false })
  } catch (error) {
    console.error('[interview-prep POST]', error)
    return NextResponse.json({ error: 'Could not generate interview prep.' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const jobDescriptionId = new URL(req.url).searchParams.get('job_description_id')
    if (!isUuid(jobDescriptionId)) return NextResponse.json({ error: 'Invalid job_description_id' }, { status: 400 })

    const { error } = await supabase
      .from('interview_prep_cache')
      .delete()
      .eq('user_id', user.id)
      .eq('job_description_id', jobDescriptionId)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[interview-prep DELETE]', error)
    return NextResponse.json({ error: 'Could not clear cache.' }, { status: 500 })
  }
}
