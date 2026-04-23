import { NextResponse } from 'next/server'
import { aiComplete } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    let supabase = await createClient()
    let { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      const authHeader = req.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7)
        const authedClient = createAnonClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        )
        const { data } = await authedClient.auth.getUser()
        user = data.user
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (user) supabase = authedClient as any
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { raw_text } = await req.json()
    if (!raw_text) {
      return NextResponse.json({ error: 'Missing raw_text' }, { status: 400 })
    }

    // Insert JD row first so we have an ID
    const { data: jdRow, error: insertError } = await supabase
      .from('job_descriptions')
      .insert({ user_id: user.id, raw_text, source_type: 'paste' })
      .select()
      .single()
    if (insertError) throw insertError

    const prompt = `Extract structured data from this job description. Output MUST be a raw JSON object starting with { and ending with }. No other text, no markdown.

Required keys:
{
  "extracted_company": "company name",
  "extracted_role_type": "one of: vp-community, head-of-community, director-community, senior-manager-community, community-manager, developer-relations, developer-advocacy, developer-community-manager, community-marketing, community-ops, community-enablement, content-strategy, ic-community",
  "extracted_themes": ["5-8 themes from: community-building, community-marketing, community-programs, community-ops, community-health, ambassador-programs, member-lifecycle, retention, engagement, developer-relations, developer-enablement, feedback-loops, ai, technical-content, hackathons, product-collaboration, product-advisory, cross-functional, data-driven, zero-to-one, scale, growth, brand, content-strategy, events, enablement, partnerships, lifecycle-marketing, leadership, executive, consulting, startup"],
  "extracted_seniority": "one of: ic, manager, senior-manager, director, vp, c-suite",
  "extracted_phrases": ["5-10 exact verbatim phrases from the job description"]
}

Job Description:
${raw_text}

JSON:`

    const rawResponseText = await aiComplete([{ role: 'user', content: prompt }], 1024)

    const stripped = rawResponseText.replace(/```json/g, '').replace(/```/g, '')
    const jsonStart = stripped.indexOf('{')
    const jsonEnd = stripped.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error(`Model did not return JSON. Response: ${stripped.slice(0, 200)}`)
    }
    const cleanJson = stripped.slice(jsonStart, jsonEnd + 1)
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,(\s*[}\]])/g, '$1')
    const extracted = JSON.parse(cleanJson)

    const { data: updated, error: updateError } = await supabase
      .from('job_descriptions')
      .update({
        extracted_company: extracted.extracted_company,
        extracted_role_type: extracted.extracted_role_type,
        extracted_themes: extracted.extracted_themes,
        extracted_seniority: extracted.extracted_seniority,
        extracted_phrases: extracted.extracted_phrases,
      })
      .eq('id', jdRow.id)
      .select()
      .single()
    if (updateError) throw updateError

    return NextResponse.json({
      jd_id: updated.id,
      extracted_company: updated.extracted_company,
      extracted_role_type: updated.extracted_role_type,
      extracted_themes: updated.extracted_themes,
      extracted_seniority: updated.extracted_seniority,
      extracted_phrases: updated.extracted_phrases,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
