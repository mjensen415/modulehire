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

    const { raw_text, resume_id } = await req.json()
    if (!raw_text || !resume_id) {
      return NextResponse.json({ error: 'Missing raw_text or resume_id' }, { status: 400 })
    }

    const prompt = `You are a resume parsing expert. Your job is to decompose a resume into
modular skill blocks. For each job in the resume, identify every distinct
skill domain the person demonstrated and create a SEPARATE module for each
domain. Do NOT create one module per job — create one module per skill
domain per job. A 4-year IT role should produce multiple modules: one for
security work, one for hardware, one for provisioning, etc.

For each module, return:
- type: 'experience' | 'skill' | 'story' | 'positioning'
- title: the skill domain name (e.g. 'Security & Vulnerability Management')
- content: the specific work within that domain, written in paragraph form
- source_company: the company name
- source_role_title: the job title held
- date_start: ISO format e.g. '2018-01'
- date_end: ISO format or 'present'
- employment_type: 'full-time' | 'consulting' | 'contract' | 'board' | 'volunteer'
- weight: 'anchor' | 'strong' | 'supporting'
- role_types: array of applicable role type tags
- themes: array of applicable theme tags
- company_stage: array from ['startup', 'growth', 'enterprise', 'any']

Valid role_types: vp-community, head-of-community, director-community,
senior-manager-community, community-manager, developer-relations,
developer-advocacy, developer-community-manager, community-marketing,
community-ops, community-enablement, content-strategy, ic-community

Valid themes: community-building, community-marketing, community-programs,
community-ops, community-health, ambassador-programs, member-lifecycle,
retention, engagement, developer-relations, developer-enablement,
feedback-loops, ai, technical-content, hackathons, product-collaboration,
product-advisory, cross-functional, data-driven, zero-to-one, scale, growth,
brand, content-strategy, events, enablement, partnerships, lifecycle-marketing,
leadership, executive, consulting, startup

Return a JSON array of module objects. Return ONLY valid JSON, no markdown.

Parse this resume text:
${raw_text}`

    const msg = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = (msg.content[0] as any).text.replace(/```json/g, '').replace(/```/g, '').trim();
    const modulesData = JSON.parse(responseText);

    const modulesToInsert = modulesData.map((m: any) => ({
      user_id: user.id,
      source_resume_id: resume_id,
      ...m
    }));

    const { data: insertedModules, error: dbError } = await supabase
      .from('modules')
      .insert(modulesToInsert)
      .select()

    if (dbError) throw dbError

    return NextResponse.json({ modules: insertedModules, count: insertedModules.length })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
