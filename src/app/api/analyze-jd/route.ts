import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { raw_text, jd_id } = await req.json()
    if (!raw_text || !jd_id) {
      return NextResponse.json({ error: 'Missing raw_text or jd_id' }, { status: 400 })
    }

    const prompt = `Analyze the following job description and extract these exact fields:
- extracted_company: string
- extracted_role_type: string (one of the valid role_types, e.g. director-community, etc)
- extracted_themes: string[] (top 5-8 themes from valid themes list like community-building, growth, etc)
- extracted_seniority: 'ic' | 'manager' | 'senior-manager' | 'director' | 'vp' | 'c-suite'
- extracted_phrases: string[] (5-10 exact phrases from the JD to mirror verbatim)

Return ONLY valid JSON with those keys, no markdown wrappers.

Job Description:
${raw_text}`

    const msg = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = ((msg.content[0] as unknown) as { text: string }).text.replace(/```json/g, '').replace(/```/g, '').trim();
    const extracted = JSON.parse(responseText);

    const { data, error } = await supabase
      .from('job_descriptions')
      .update({
        extracted_company: extracted.extracted_company,
        extracted_role_type: extracted.extracted_role_type,
        extracted_themes: extracted.extracted_themes,
        extracted_seniority: extracted.extracted_seniority,
        extracted_phrases: extracted.extracted_phrases,
      })
      .eq('id', jd_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ job_description: data })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
