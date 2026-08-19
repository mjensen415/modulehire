import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgRole } from '@/lib/business/org-access'
import { aiComplete } from '@/lib/ai'
import { jsonrepair } from 'jsonrepair'

export const maxDuration = 60

type AiCheckResult = {
  likely_ai: boolean
  confidence: 'low' | 'medium' | 'high'
  signals: string[]
  human_signals: string[]
  summary: string
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: applicant, error: applicantError } = await supabase
      .from('applicants')
      .select('raw_text, org_id')
      .eq('id', id)
      .single()
    if (applicantError || !applicant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const role = await getOrgRole(supabase, applicant.org_id, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!applicant.raw_text) {
      return NextResponse.json({ error: 'No resume text to analyze.' }, { status: 400 })
    }

    const prompt = `You are reviewing a resume for signs that it was AI-generated or heavily AI-optimized rather than written authentically.

Analyze the following resume text and return a JSON object with:
- likely_ai: boolean — true if you believe this was largely AI-generated
- confidence: "low" | "medium" | "high"
- signals: string[] — up to 5 specific signals you noticed (e.g. "Perfect parallel structure across all bullet points", "Unusually comprehensive skills list with no gaps", "Generic impact metrics without specificity")
- human_signals: string[] — up to 3 signs of authentic human writing (typos, personal voice, specific details, etc.)
- summary: string — one sentence assessment

Be conservative. Flag as likely_ai only when you see multiple strong signals. A well-written resume is not by itself suspicious.

Resume text:
---
${applicant.raw_text.slice(0, 4000)}
---

Return only valid JSON, no markdown.`

    const raw = await aiComplete([{ role: 'user', content: prompt }], 1000)

    let parsed: AiCheckResult
    try {
      const stripped = raw.replace(/```json/g, '').replace(/```/g, '').trim()
      parsed = JSON.parse(jsonrepair(stripped)) as AiCheckResult
    } catch {
      return NextResponse.json({ error: 'Analysis failed — could not parse AI response.' }, { status: 500 })
    }

    const { error: updateError } = await supabase
      .from('applicants')
      .update({ ai_check_result: parsed, ai_checked_at: new Date().toISOString() })
      .eq('id', id)
    if (updateError) throw updateError

    return NextResponse.json({ result: parsed })
  } catch (error) {
    console.error('[business/applicants/[id]/ai-check POST]', error)
    return NextResponse.json({ error: 'Could not run AI check.' }, { status: 500 })
  }
}
