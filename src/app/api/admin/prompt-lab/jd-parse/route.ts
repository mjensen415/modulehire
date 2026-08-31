import { NextResponse } from 'next/server'
import { aiComplete } from '@/lib/ai'
import { requireAdmin } from '@/lib/admin-guard'

export const maxDuration = 60

export const DEFAULT_JD_PARSE_PROMPT = `Extract structured data from this job description. Output MUST be a raw JSON object starting with { and ending with }. No other text, no markdown.

Required keys:
{
  "extracted_company": "company name or empty string if not found",
  "extracted_job_title": "the literal job title as written in the JD (e.g. 'Head of People', 'Senior Software Engineer'). Empty string if no clear title is present.",
  "extracted_role_type": "Identify the role type from the overall nature of the work and responsibilities described — not by matching keywords in the title. A 'Data Analyst' role doing SQL, dashboards, and reporting is 'data-scientist' ONLY if the role genuinely requires ML/modeling. If the role is fundamentally analytical/BI work, use 'operations' or 'other'. Best match from: vp-community, head-of-community, director-community, senior-manager-community, community-manager, developer-relations, developer-advocacy, developer-community-manager, community-marketing, community-ops, community-enablement, content-strategy, ic-community, software-engineer, product-manager, designer, data-scientist, marketing-manager, sales, operations, finance, hr, other",
  "extracted_themes": ["5-12 short skill or competency themes that this role requires — use plain English phrases like 'cross-functional collaboration', 'data analysis', 'team leadership', 'product strategy', 'customer success', 'technical writing', 'go-to-market', 'stakeholder management'. Extract every distinct competency the role genuinely requires; do not invent themes not implied by the JD, but do not drop real requirements to stay under a count. Choose themes that reflect the actual requirements of THIS specific job description, not a predefined list."],
  "extracted_seniority": "Infer seniority from the required years of experience, scope of responsibilities, and whether the role manages people or budget — not from words like 'senior' or 'manager' appearing in job requirements. A job requiring 2-4 years with no direct reports is 'ic'. One of: ic, manager, senior-manager, director, vp, c-suite",
  "extracted_phrases": ["5-10 exact verbatim phrases from the job description that a resume should echo to pass ATS"]
}

Job Description:
{{raw_text}}

JSON:`

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error

  try {
    const { raw_text, prompt_override, model } = await req.json()
    if (typeof raw_text !== 'string' || !raw_text) {
      return NextResponse.json({ error: 'Missing raw_text' }, { status: 400 })
    }
    if (raw_text.length > 50_000) {
      return NextResponse.json({ error: 'Job description too long (max 50,000 chars)' }, { status: 400 })
    }

    const template = typeof prompt_override === 'string' && prompt_override.trim()
      ? prompt_override
      : DEFAULT_JD_PARSE_PROMPT
    const prompt = template.includes('{{raw_text}}')
      ? template.replace('{{raw_text}}', raw_text)
      : `${template}\n\nJob Description:\n${raw_text}\n\nJSON:`

    const rawResponseText = await aiComplete([{ role: 'user', content: prompt }], 1024, { model: typeof model === 'string' ? model : undefined })

    const stripped = rawResponseText.replace(/```json/g, '').replace(/```/g, '')
    const jsonStart = stripped.indexOf('{')
    const jsonEnd = stripped.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) {
      return NextResponse.json({
        error: `Model did not return JSON. Response: ${stripped.slice(0, 200)}`,
        raw_ai_response: rawResponseText,
        prompt_used: prompt,
      }, { status: 502 })
    }
    const cleanJson = stripped.slice(jsonStart, jsonEnd + 1)
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,(\s*[}\]])/g, '$1')
    const extracted = JSON.parse(cleanJson)

    return NextResponse.json({
      extracted,
      raw_ai_response: rawResponseText,
      prompt_used: prompt,
      model_used: model || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    })
  } catch (error) {
    console.error('[admin/prompt-lab/jd-parse]', error)
    return NextResponse.json({ error: 'Could not analyze job description.' }, { status: 500 })
  }
}
