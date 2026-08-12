import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aiComplete } from '@/lib/ai'
import { jsonrepair } from 'jsonrepair'
import { isProTier } from '@/lib/plan'

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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
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

    const { data: application, error: appError } = await supabase
      .from('job_applications')
      .select('id, company, title, jd_text, prep_data, prep_generated_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (appError || !application) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!application.jd_text || !application.jd_text.trim()) {
      return NextResponse.json({ error: 'This application has no job description saved yet.' }, { status: 400 })
    }

    let forceRegenerate = false
    try {
      const body = await req.json()
      forceRegenerate = !!body?.regenerate
    } catch {
      // No body sent — default to cache-aware behavior
    }

    if (!forceRegenerate && application.prep_data && application.prep_generated_at) {
      const age = Date.now() - new Date(application.prep_generated_at).getTime()
      if (age < CACHE_MAX_AGE_MS) {
        return NextResponse.json({ prep: application.prep_data, generated_at: application.prep_generated_at, cached: true })
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

    const prompt = `You are helping a job candidate prepare for an interview. Surface THEIR OWN experience in the context of this job description — do not write answers for them, just help them see the connections.

JOB TITLE: ${application.title}
COMPANY: ${application.company}

JOB DESCRIPTION:
${application.jd_text.slice(0, 12_000)}

CANDIDATE'S EXPERIENCE (from their resume/module library):
${resumeContent}

Extract 5-7 key requirements from the job description. For each, identify the most relevant experience from the candidate's background and suggest a brief framing for how to talk about it — guidance, not a script.

Return ONLY a valid JSON object — no explanation, no markdown, no code fences:
{
  "job_title": "${application.title}",
  "company": "${application.company}",
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
    const { error: updateError } = await supabase
      .from('job_applications')
      .update({ prep_data: prep, prep_generated_at: generatedAt })
      .eq('id', id)
      .eq('user_id', user.id)
    if (updateError) throw updateError

    return NextResponse.json({ prep, generated_at: generatedAt, cached: false })
  } catch (error) {
    console.error('[job-tracker/[id]/prep POST]', error)
    return NextResponse.json({ error: 'Could not generate interview prep.' }, { status: 500 })
  }
}
