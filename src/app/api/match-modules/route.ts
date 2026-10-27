import { NextResponse } from 'next/server'
import { aiCompleteJson } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid } from '@/lib/validate'
import { finishMatch, loadMatchInputs, localShortlist, MatchError, rescoreShortlist, topOf, withPrior, type MatchInputs, type MatchModule, type RankedModule } from '@/lib/match'

export const maxDuration = 120

const RANK_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    module_id: { type: 'string', description: 'Exact id from the module list above' },
    match_score: { type: 'number', description: '0-100' },
    include_reason: { type: 'string', description: 'Max 8-word phrase, not a full sentence' },
  },
  required: ['module_id', 'match_score', 'include_reason'],
}

const PASS1_SCHEMA = {
  type: 'object',
  properties: {
    ranked_modules: { type: 'array', items: RANK_ITEM_SCHEMA, description: 'One entry for every module in the list' },
  },
  required: ['ranked_modules'],
}

// Pass 1 scores the library in parallel batches. One call over a large library (150+ modules)
// ran past the output limit, the structured result came back empty, and the route crashed.
const PASS1_BATCH_SIZE = 40

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

    const limit = await checkAndLog(supabase, user.id, 'rl_match_modules', 60, 3600)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }

    const { jd_id } = await req.json()
    if (!isUuid(jd_id)) {
      return NextResponse.json({ error: 'Invalid jd_id' }, { status: 400 })
    }

    let inputs: MatchInputs
    try {
      inputs = await loadMatchInputs(supabase, user.id, jd_id)
    } catch (e) {
      if (e instanceof MatchError) return NextResponse.json({ error: e.message }, { status: e.status })
      throw e
    }
    const { jd, modules, moduleMap } = inputs

    // Pass 1: local term-overlap shortlist (milliseconds). The old batched AI pass 1 took
    // 25-30s on large libraries; it's kept behind ?ai_pass1=1 for Prompt Lab comparisons.
    let pass1: RankedModule[]
    let shortlist: MatchModule[]
    if (new URL(req.url).searchParams.get('ai_pass1') !== '1') {
      ({ pass1, shortlist } = localShortlist(jd, inputs))
    } else {
      const taskBlock = `Score every module above against the job description below.

JOB DESCRIPTION:
Company: ${jd.extracted_company}
Role: ${jd.extracted_role_type}
Seniority: ${jd.extracted_seniority}
Key themes: ${(jd.extracted_themes || []).join(', ')}
Key phrases: ${(jd.extracted_phrases || []).join(', ')}

${inputs.prefContext ? inputs.prefContext + '\n\n' : ''}SCORING RULES:
- match_score is 0-100 based on how well the module's actual relevance matches the job description themes
- score every module honestly on fit to this specific job — do not give any module an automatic high score
- return an entry for every module in the list${inputs.reportContext}`

      const batches: MatchModule[][] = []
      for (let i = 0; i < modules.length; i += PASS1_BATCH_SIZE) batches.push(modules.slice(i, i + PASS1_BATCH_SIZE))
      const scoreBatch = async (batch: MatchModule[]): Promise<RankedModule[]> => {
        const list = batch.map(m =>
          `- id: ${m.id} | title: ${m.title} | themes: ${(m.themes || []).join(', ')} | weight: ${m.weight}`
        ).join('\n')
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const r = await aiCompleteJson<{ ranked_modules?: RankedModule[] }>(
              [
                { role: 'system', content: 'You are a resume reviewer.' },
                { role: 'user', content: `Here are some of the candidate's resume modules:\n\nRESUME MODULES:\n${list}\n\n${taskBlock}` },
              ],
              PASS1_SCHEMA,
              4096,
              { tier: 'fast' }
            )
            if (Array.isArray(r?.ranked_modules) && r.ranked_modules.length > 0) return r.ranked_modules
          } catch (e) {
            console.error('[match-modules] pass 1 batch failed:', e)
          }
        }
        return []
      }
      const knownIds = new Set(modules.map(m => m.id))
      const raw = (await Promise.all(batches.map(scoreBatch))).flat()
        .filter(rm => rm && knownIds.has(rm.module_id) && typeof rm.match_score === 'number')
      if (raw.length === 0) {
        return NextResponse.json({ error: 'We couldn\'t score your modules against this job right now. Please try again in a minute.' }, { status: 502 })
      }
      pass1 = withPrior(raw, moduleMap)
      shortlist = topOf(pass1, moduleMap)
    }

    const ranked = await rescoreShortlist(jd, inputs, pass1, shortlist, user.id)
    return NextResponse.json(await finishMatch(supabase, user.id, inputs, ranked))
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
