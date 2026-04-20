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

    const { jd_id, user_id } = await req.json()
    const targetUserId = user.id

    const { data: jd, error: jdError } = await supabase
      .from('job_descriptions')
      .select('*')
      .eq('id', jd_id)
      .single()
    
    if (jdError) throw jdError

    const { data: modules, error: modError } = await supabase
      .from('modules')
      .select('id, title, themes, weight')
      .eq('user_id', targetUserId)

    if (modError) throw modError

    const prompt = `Rank these resume modules against the job description.
    
Job Description:
Company: ${jd.extracted_company}
Themes: ${(jd.extracted_themes || []).join(', ')}
Role: ${jd.extracted_role_type}
Seniority: ${jd.extracted_seniority}
Phrases: ${(jd.extracted_phrases || []).join(', ')}

Modules available:
${JSON.stringify(modules)}

Rules:
Return an array of objects with keys: module_id, match_score (0-100), include_reason.
- Anchor modules always score 100
- Strong modules included if score >= 65
- Supporting modules included if score >= 80

Also return a 'recommended_stack' which is an ordered array of module_ids for the top 6-10 modules to actually use.

Output JSON format: { "ranked_modules": [{...}], "recommended_stack": ["uuid", ...] }
No markdown.`

    const msg = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = (msg.content[0] as any).text.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(responseText);

    return NextResponse.json(result)
  } catch (error: any) {
    console.error(error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
