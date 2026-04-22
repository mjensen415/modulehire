import { NextResponse } from 'next/server'
import { aiComplete } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    let supabase = await createClient()
    let { data: { user } } = await supabase.auth.getUser()

    // Fallback: accept a real user JWT in the Authorization header (for scripts/API callers)
    // When using Bearer auth, rebuild the DB client with the token so RLS works correctly.
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
        if (user) supabase = authedClient as any  // use token-authed client for all DB ops
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { raw_text, resume_id } = await req.json()
    if (!raw_text || !resume_id) {
      return NextResponse.json({ error: 'Missing raw_text or resume_id' }, { status: 400 })
    }

    const prompt = `You are a resume parsing expert. Decompose the resume below into modular skill blocks.

RULES:
- Create one module per skill domain per job (NOT one module per job)
- A 4-year IT role should produce multiple modules: security, hardware, provisioning, etc.
- Output MUST be a raw JSON array. Start your response with [ and end with ]. No other text.

Each module object must have these exact keys:
{
  "type": "experience" | "skill" | "story" | "positioning",
  "title": "skill domain name e.g. Security & Vulnerability Management",
  "content": "paragraph describing the work in this domain",
  "source_company": "company name",
  "source_role_title": "job title",
  "date_start": "YYYY-MM",
  "date_end": "YYYY-MM or present",
  "employment_type": "full-time" | "consulting" | "contract" | "board" | "volunteer",
  "weight": "anchor" | "strong" | "supporting",
  "role_types": ["one of: vp-community, head-of-community, director-community, senior-manager-community, community-manager, developer-relations, developer-advocacy, developer-community-manager, community-marketing, community-ops, community-enablement, content-strategy, ic-community"],
  "themes": ["one of: community-building, community-marketing, community-programs, community-ops, community-health, ambassador-programs, member-lifecycle, retention, engagement, developer-relations, developer-enablement, feedback-loops, ai, technical-content, hackathons, product-collaboration, product-advisory, cross-functional, data-driven, zero-to-one, scale, growth, brand, content-strategy, events, enablement, partnerships, lifecycle-marketing, leadership, executive, consulting, startup"],
  "company_stage": ["startup" | "growth" | "enterprise" | "any"]
}

Resume:
${raw_text}

JSON array:`

    const rawResponseText = await aiComplete([{ role: 'user', content: prompt }], 4096);

    // Extract JSON array robustly — handle preamble text from smaller models
    const stripped = rawResponseText.replace(/```json/g, '').replace(/```/g, '');
    const jsonStart = stripped.indexOf('[');
    const jsonEnd = stripped.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error(`Model did not return a JSON array. Response: ${stripped.slice(0, 200)}`);
    }
    const cleanJson = stripped.slice(jsonStart, jsonEnd + 1)
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,(\s*[}\]])/g, '$1')
    const modulesData = JSON.parse(cleanJson);

    // Normalize array fields — smaller models sometimes return a plain string instead of an array
    const toArray = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.map(String)
      if (typeof v === 'string' && v.length > 0) return [v]
      return []
    }

    const VALID_TYPES = new Set(['experience', 'skill', 'story', 'positioning'])
    const VALID_WEIGHTS = new Set(['anchor', 'strong', 'supporting'])
    const VALID_EMP_TYPES = new Set(['full-time', 'consulting', 'contract', 'board', 'volunteer'])

    const modulesToInsert = modulesData.map((m: Record<string, unknown>) => ({
      user_id: user.id,
      source_resume_id: resume_id,
      ...m,
      // Coerce array fields — smaller models sometimes return a plain string
      role_types:    toArray(m.role_types),
      themes:        toArray(m.themes),
      company_stage: toArray(m.company_stage),
      // Clamp enum fields to valid values, fallback if model returns something unexpected
      type:            VALID_TYPES.has(m.type as string)       ? m.type       : 'experience',
      weight:          VALID_WEIGHTS.has(m.weight as string)   ? m.weight     : 'supporting',
      employment_type: VALID_EMP_TYPES.has(m.employment_type as string) ? m.employment_type : 'full-time',
      title:           m.title   ?? 'Untitled Module',
      content:         m.content ?? '',
    }));

    const { data: insertedModules, error: dbError } = await supabase
      .from('modules')
      .insert(modulesToInsert)
      .select()

    if (dbError) throw dbError

    return NextResponse.json({ modules: insertedModules, count: insertedModules.length })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
