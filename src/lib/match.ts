// Module matching in steps, so callers can overlap them with other work: /api/match-modules
// runs them back to back; /api/jobs/start builds the shortlist as soon as the posting's basics
// are in, re-ranks it when criteria land, and only then pays for the AI pass.
import type { SupabaseClient } from '@supabase/supabase-js'
import { aiCompleteJson } from './ai'
import { getActiveProfileId } from './profile'
import { getUserPreferences, buildPreferenceContext } from './preferences'
import { shortlistScores } from './shortlist'
import { sanitizeCriteria } from './dimensions'

export type RankedModule = { module_id: string; match_score: number; include_reason: string }

export type MatchModule = {
  id: string
  title: string
  themes: string[] | null
  weight: string
  pinned: boolean
  type: string
  content: string | null
  source_company: string | null
  source_role_title: string | null
  date_start: string | null
  date_end: string | null
  dimensions: string[] | null
}

// The JD row as matching reads it (`select('*')` in practice).
export type MatchJd = Record<string, unknown> & {
  id: string
  extracted_company?: string | null
  extracted_role_type?: string | null
  extracted_seniority?: string | null
  extracted_job_title?: string | null
  extracted_themes?: string[] | null
  extracted_phrases?: string[] | null
  extracted_criteria?: unknown
  match_report?: unknown
  match_report_profile_id?: string | null
}

export type MatchInputs = {
  jd: MatchJd
  modules: MatchModule[]
  moduleMap: Map<string, MatchModule>
  profileId: string
  prefContext: string
  reportContext: string
}

// Weight is a minor, code-applied nudge — never an override. This is deliberately not part
// of the prompt: trusting the model to self-limit an "always score 100" rule is exactly what
// broke this before (over-tagged anchor modules auto-maxed regardless of JD fit).
export const WEIGHT_PRIOR: Record<string, number> = { anchor: 8, strong: 3, supporting: 0 }
export const PASS2_SHORTLIST_SIZE = 20

const MODULE_FIELDS = 'id, title, themes, weight, pinned, type, content, source_company, source_role_title, date_start, date_end, dimensions'

export class MatchError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

/** The JD (scoped to the user), the active profile's modules, and the prompt context. */
export async function loadMatchInputs(supabase: SupabaseClient, userId: string, jdId: string): Promise<MatchInputs> {
  const [{ data: jd, error: jdError }, profileId] = await Promise.all([
    supabase.from('job_descriptions').select('*').eq('id', jdId).eq('user_id', userId).single(),
    getActiveProfileId(supabase, userId),
  ])
  if (jdError || !jd) throw new MatchError('Job description not found', 404)

  const [{ data: modules, error: modError }, prefs] = await Promise.all([
    supabase.from('modules').select(MODULE_FIELDS).eq('user_id', userId).eq('profile_id', profileId).is('deleted_at', null),
    getUserPreferences(supabase, userId),
  ])
  if (modError) throw modError
  if (!modules || modules.length === 0) {
    throw new MatchError('Your module library is empty for this profile. Upload a resume or switch profiles, then try matching again.', 400)
  }

  // If a Match Report already scored this JD against this profile, surface its per-criterion
  // scores so ranking agrees with the report instead of re-deriving an independent judgment.
  type StoredReport = { criteria: Array<{ label: string; weight: number; score: number; evidence: Array<{ id: string; title: string }> }> }
  const storedReport = jd.match_report_profile_id === profileId ? (jd.match_report as StoredReport | null) : null
  const reportContext = storedReport && storedReport.criteria?.length
    ? `\n\nMATCH REPORT CONTEXT (this candidate was already scored against this JD's criteria — use it to calibrate, don't just copy it):\n${storedReport.criteria.map(c =>
        `- "${c.label}" (weight ${c.weight}/5): ${c.score}% match${c.evidence?.length ? ` — strongest evidence: ${c.evidence.map(e => e.title).join(', ')}` : ''}`
      ).join('\n')}`
    : ''

  const list = modules as MatchModule[]
  return {
    jd: jd as MatchJd,
    modules: list,
    moduleMap: new Map(list.map(m => [m.id, m])),
    profileId,
    prefContext: buildPreferenceContext(prefs),
    reportContext,
  }
}

/** Applies the weight prior to raw pass-1 scores. */
export function withPrior(raw: RankedModule[], moduleMap: Map<string, MatchModule>): RankedModule[] {
  return raw.map(rm => {
    const m = moduleMap.get(rm.module_id)
    const prior = m ? (WEIGHT_PRIOR[m.weight] ?? 0) : 0
    return { ...rm, match_score: Math.min(100, Math.round(rm.match_score) + prior) }
  })
}

/** Local, AI-free pass 1: term-overlap scores for every module, plus the top of the list. */
export function localShortlist(jd: MatchJd, inputs: Pick<MatchInputs, 'modules' | 'moduleMap'>): { pass1: RankedModule[]; shortlist: MatchModule[] } {
  const local = shortlistScores(jd, inputs.modules)
  const pass1 = withPrior(inputs.modules.map(m => ({ module_id: m.id, match_score: local.get(m.id) ?? 0, include_reason: '' })), inputs.moduleMap)
  return { pass1, shortlist: topOf(pass1, inputs.moduleMap) }
}

export function topOf(pass1: RankedModule[], moduleMap: Map<string, MatchModule>): MatchModule[] {
  return [...pass1]
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, PASS2_SHORTLIST_SIZE)
    .map(rm => moduleMap.get(rm.module_id))
    .filter((m): m is MatchModule => m !== undefined)
}

// Pass 2 returns scores only. Writing an 8-word reason per module cost ~15s of output on
// Haiku and the v2 flow never shows reasons.
const PASS2_SCHEMA = {
  type: 'object',
  properties: {
    ranked_modules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: 'The module\'s short ref from the list above, e.g. "m3"' },
          match_score: { type: 'number', description: '0-100' },
        },
        required: ['ref', 'match_score'],
      },
    },
  },
  required: ['ranked_modules'],
}

/**
 * Pass 2: pass 1 never reads a module's full content — it can't tell a strong module from a
 * vague one with a good title. Re-score the shortlist with content so the score that decides
 * recommended_stack reflects what the module says. Falls back to pass 1 if the call fails.
 */
export async function rescoreShortlist(jd: MatchJd, inputs: MatchInputs, pass1: RankedModule[], shortlist: MatchModule[], userId: string): Promise<RankedModule[]> {
  if (shortlist.length === 0) return pass1
  const criteria = sanitizeCriteria(jd.extracted_criteria)
  // Short refs instead of UUIDs: 20 UUIDs in the output overran max_tokens (the call was cut
  // off and silently fell back to pass 1 on every run) and cost ~25 tokens each to write.
  const refToId = new Map(shortlist.map((m, i) => [`m${i + 1}`, m.id]))
  const shortlistBlock = shortlist.map((m, i) =>
    `- ref: m${i + 1} | title: ${m.title} | themes: ${(m.themes || []).join(', ')} | weight: ${m.weight}\n  content: ${String(m.content ?? '').slice(0, 900)}`
  ).join('\n')

  const pass2Prompt = `Re-score these shortlisted resume modules against the job description below, now that you can see their full content — not just title and themes.

JOB DESCRIPTION:
Company: ${jd.extracted_company}
Role: ${jd.extracted_role_type}
Seniority: ${jd.extracted_seniority}
Key themes: ${(jd.extracted_themes || []).join(', ')}
Key phrases: ${(jd.extracted_phrases || []).join(', ')}${criteria.length > 0 ? `\nRequirements: ${criteria.map(c => `${c.label} (weight ${c.weight}/5)`).join('; ')}` : ''}

SHORTLISTED MODULES:
${shortlistBlock}

${inputs.prefContext ? inputs.prefContext + '\n\n' : ''}SCORING RULES:
- match_score is 0-100 based on how well the module's actual content matches the job description — a good title with weak or unrelated content should score lower than pass 1 suggested
- score every module honestly on fit to this specific job — do not give any module an automatic high score${inputs.reportContext}`

  try {
    const result = await aiCompleteJson<{ ranked_modules: Array<{ ref: string; match_score: number }> }>(
      [
        { role: 'system', content: 'You are a resume reviewer.' },
        { role: 'user', content: pass2Prompt },
      ],
      PASS2_SCHEMA,
      600,
      { tier: 'quality', userId, action: 'match_job_pass2' }
    )
    const pass2Scores = new Map<string, number>()
    for (const rm of result.ranked_modules ?? []) {
      const id = refToId.get(String(rm.ref).trim())
      if (!id || typeof rm.match_score !== 'number') continue
      const prior = WEIGHT_PRIOR[inputs.moduleMap.get(id)?.weight ?? ''] ?? 0
      pass2Scores.set(id, Math.min(100, Math.max(0, Math.round(rm.match_score)) + prior))
    }
    if (pass2Scores.size === 0) throw new Error('pass 2 returned no usable scores')
    // Modules outside the shortlist only have a rough local score; keep them below the
    // AI-verified ones so the recommended stack is always drawn from the re-scored list.
    return pass1.map(rm => (pass2Scores.has(rm.module_id)
      ? { ...rm, match_score: pass2Scores.get(rm.module_id)!, include_reason: rm.include_reason ?? '' }
      : { ...rm, match_score: Math.min(rm.match_score, 35) }))
  } catch (pass2Error) {
    // Pass 2 is a refinement, not a requirement — fall back to pass 1 scores rather than
    // failing the whole match if the second call errors.
    console.error('[match] pass 2 failed, using pass 1 scores:', pass2Error)
    return pass1
  }
}

export type MatchResult = {
  ranked_modules: Array<RankedModule & MatchModule>
  recommended_stack: string[]
  unmatched_modules: MatchModule[]
}

/** Enriches the final ranking, picks the recommended stack, and logs the run. */
export async function finishMatch(supabase: SupabaseClient, userId: string, inputs: MatchInputs, ranked: RankedModule[]): Promise<MatchResult> {
  const enriched = ranked
    .map(rm => {
      const m = inputs.moduleMap.get(rm.module_id)
      return m ? { ...rm, ...m, module_id: rm.module_id } : null
    })
    .filter((m): m is RankedModule & MatchModule => m !== null)

  // recommended_stack: pinned modules always included (their real score still shows honestly),
  // then fill the remaining 4-8 slots with the next highest-scoring non-pinned modules.
  const pinnedIds = enriched.filter(m => m.pinned).map(m => m.module_id)
  const nonPinned = [...enriched].filter(m => !m.pinned).sort((a, b) => b.match_score - a.match_score)
  const targetSize = Math.max(4, Math.min(8, pinnedIds.length + 6))
  const recommendedStack = [...pinnedIds, ...nonPinned.slice(0, Math.max(0, targetSize - pinnedIds.length)).map(m => m.module_id)]

  const rankedIds = new Set(ranked.map(r => r.module_id))
  const unmatched = inputs.modules.filter(m => !rankedIds.has(m.id))

  await supabase.from('usage_events').insert({ user_id: userId, action: 'match_job' })
  // Log what the matcher decided, for later validation against real usage — a logging failure
  // must never fail the match itself.
  const { error: logError } = await supabase.from('match_runs').insert({
    user_id: userId,
    jd_id: inputs.jd.id,
    ranked_modules: enriched.map(m => ({ module_id: m.module_id, match_score: m.match_score, include_reason: m.include_reason })),
    recommended_stack: recommendedStack,
  })
  if (logError) console.error('[match] match_runs insert failed:', logError)

  return { ranked_modules: enriched, recommended_stack: recommendedStack, unmatched_modules: unmatched }
}
