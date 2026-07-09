import { NextResponse } from 'next/server'
import { aiComplete } from '@/lib/ai'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'

export const maxDuration = 30

type Pair = { new_id: string; existing_id: string; confidence: 'high' | 'medium'; reason: string }
type ExpRow = { id: string; company: string; title: string | null; start_date: string | null; end_date: string | null; location: string | null }

// After a resume parse creates job_experiences, flag likely duplicates of the
// user's existing entries (e.g. "33 Crickets" vs "33 Crickets / Sharpen
// Consulting") so they can be merged before landing on the library.
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { new_experience_ids } = await req.json()
    if (!Array.isArray(new_experience_ids) || new_experience_ids.length === 0 || !new_experience_ids.every(isUuid)) {
      return NextResponse.json({ error: 'new_experience_ids must be a non-empty array of ids' }, { status: 400 })
    }
    const newIds: string[] = [...new Set(new_experience_ids as string[])]

    const admin = await createAdminClient()

    // 1. New experiences (scoped to user).
    const { data: newRows, error: newErr } = await admin
      .from('job_experiences')
      .select('id, company, title, start_date, end_date, location')
      .eq('user_id', user.id)
      .in('id', newIds)
    if (newErr) throw newErr
    if (!newRows || newRows.length === 0) return NextResponse.json({ pairs: [] })
    const validNewIds = new Set(newRows.map(r => r.id))

    // 2. The user's OTHER existing experiences.
    const { data: existingRows, error: existErr } = await admin
      .from('job_experiences')
      .select('id, company, title, start_date, end_date, location')
      .eq('user_id', user.id)
      .not('id', 'in', `(${newIds.join(',')})`)
    if (existErr) throw existErr
    if (!existingRows || existingRows.length === 0) return NextResponse.json({ pairs: [] })

    // 3. Ask Claude for fuzzy duplicate pairs.
    const prompt = `You are de-duplicating a user's work history. Some entries were just parsed from a new resume; compare them against the user's existing entries and flag likely duplicates — the SAME real-world job appearing twice.

NEW entries:
${JSON.stringify(newRows)}

EXISTING entries:
${JSON.stringify(existingRows)}

Return ONLY a JSON array of duplicate pairs, no prose:
[{ "new_id": "<id from NEW>", "existing_id": "<id from EXISTING>", "confidence": "high" | "medium", "reason": "<short reason>" }]

Rules:
- "high" = almost certainly the same job: same company (allowing name variants) AND overlapping/identical dates AND a similar or promotion-related title.
- "medium" = plausibly the same job, but ONLY when BOTH of these hold: (a) the company names are similar or variants of each other, AND (b) the date ranges overlap. A differing title (possible promotion/retitle) may keep confidence at medium, but it NEVER removes the date-overlap requirement.
- Company similarity ALONE is not enough. Two roles at the same company with non-overlapping date ranges are DIFFERENT jobs (e.g. two separate consulting engagements) — never flag them.
- If a pair lacks usable dates on either side to confirm overlap, do NOT flag it.
- Only include pairs with confidence high or medium. Omit weak guesses.
- Company matching is FUZZY: "33 Crickets" matches "33 Crickets / Sharpen Consulting", "Sharpen Consulting - Coraigen", etc. Match on the shared/anchor company token.
- If in doubt, do NOT return the pair — it is better to miss a duplicate than to incorrectly flag two different jobs at the same company (e.g. two separate consulting engagements).
- Each new_id must come from NEW and each existing_id from EXISTING.
- If there are no duplicates, return [].`

    const raw = await aiComplete([{ role: 'user', content: prompt }], 1024)
    const stripped = raw.replace(/```json/g, '').replace(/```/g, '')
    const start = stripped.indexOf('['), end = stripped.lastIndexOf(']')
    let pairs: Pair[] = []
    if (start !== -1 && end !== -1) {
      try {
        const parsed = JSON.parse(stripped.slice(start, end + 1)) as Pair[]
        // Keep only well-formed pairs that reference real ids on the correct side.
        const existingIdSet = new Set(existingRows.map(r => r.id))
        pairs = (Array.isArray(parsed) ? parsed : []).filter(p =>
          p && validNewIds.has(p.new_id) && existingIdSet.has(p.existing_id) &&
          (p.confidence === 'high' || p.confidence === 'medium'),
        )
      } catch {
        pairs = []
      }
    }

    if (pairs.length === 0) return NextResponse.json({ pairs: [] })

    // Enrich each pair with the full experience rows + module counts for the UI.
    const byId = new Map<string, ExpRow>()
    for (const r of [...newRows, ...existingRows] as ExpRow[]) byId.set(r.id, r)
    const involved = [...new Set(pairs.flatMap(p => [p.new_id, p.existing_id]))]
    const { data: countRows } = await admin
      .from('module_job_assignments')
      .select('job_id')
      .in('job_id', involved)
    const counts = new Map<string, number>()
    for (const c of (countRows ?? [])) counts.set(c.job_id, (counts.get(c.job_id) ?? 0) + 1)
    const withCount = (id: string) => {
      const r = byId.get(id)!
      return { ...r, moduleCount: counts.get(id) ?? 0 }
    }

    const enriched = pairs.map(p => ({
      ...p,
      new: withCount(p.new_id),
      existing: withCount(p.existing_id),
    }))

    return NextResponse.json({ pairs: enriched })
  } catch (error) {
    console.error('[detect-duplicate-experiences]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
