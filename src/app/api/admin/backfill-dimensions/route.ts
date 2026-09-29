import { NextResponse } from 'next/server'
import { aiComplete } from '@/lib/ai'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-guard'
import { DIMENSIONS, isDimension } from '@/lib/dimensions'
import { jsonrepair } from 'jsonrepair'

export const maxDuration = 300

const BATCH_SIZE = 40
const TIME_BUDGET_MS = 250_000

export async function POST() {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error

  const started = Date.now()
  const admin = await createAdminClient()
  let tagged = 0

  try {
    while (Date.now() - started < TIME_BUDGET_MS) {
      const { data: modules, error } = await admin
        .from('modules')
        .select('id, title, content')
        .eq('dimensions', '{}')
        .is('deleted_at', null)
        .limit(BATCH_SIZE)
      if (error) throw error
      if (!modules || modules.length === 0) break

      const moduleList = modules.map(m =>
        `- id: ${m.id} | title: ${m.title} | content: ${String(m.content ?? '').slice(0, 300)}`
      ).join('\n')

      const prompt = `Tag each resume module below with 1-3 dimensions describing what it is evidence FOR — which aspects of a candidate it demonstrates. Every module must get at least one dimension — pick the closest fit even if the module is a weak or partial example.

DIMENSIONS — pick only from this exact list:
${DIMENSIONS.join(', ')}
- role: the function/title this module demonstrates
- seniority: level, scope, team size, budget owned
- responsibility: what they owned and delivered day to day
- skill: specific competencies or tools demonstrated
- domain: industry or problem space
- collaboration: who they worked with — cross-functional, stakeholders, leadership

MODULES:
${moduleList}

Output ONLY a raw JSON array, no other text — one entry per module above, in any order:
[{ "id": "<id from list above>", "dimensions": ["1-3 values from the list above"] }]

JSON:`

      const raw = await aiComplete([{ role: 'user', content: prompt }], 2048, { tier: 'fast' })
      const stripped = raw.replace(/```json/g, '').replace(/```/g, '').trim()
      const start = stripped.indexOf('[')
      const end = stripped.lastIndexOf(']')

      let results: Array<{ id: string; dimensions: string[] }> = []
      if (start !== -1 && end !== -1) {
        try {
          results = JSON.parse(stripped.slice(start, end + 1))
        } catch {
          try {
            results = JSON.parse(jsonrepair(stripped.slice(start, end + 1)))
          } catch (parseError) {
            console.error('[backfill-dimensions] JSON parse failed for batch:', parseError)
          }
        }
      }

      // Every module in this batch must leave the '{}' pool, whether or not the model
      // returned it, or the next iteration re-selects the same batch and never progresses.
      const resultMap = new Map(results.map(r => [r.id, r]))
      for (const m of modules) {
        const dims = (resultMap.get(m.id)?.dimensions ?? []).filter(isDimension).slice(0, 3)
        const finalDims = dims.length > 0 ? dims : ['skill'] as const
        const { error: updateError } = await admin
          .from('modules')
          .update({ dimensions: finalDims })
          .eq('id', m.id)
        if (updateError) {
          console.error('[backfill-dimensions] update failed for', m.id, updateError)
          continue
        }
        tagged++
      }
    }

    const { count: remaining } = await admin
      .from('modules')
      .select('id', { count: 'exact', head: true })
      .eq('dimensions', '{}')
      .is('deleted_at', null)

    return NextResponse.json({ tagged, remaining: remaining ?? 0 })
  } catch (error) {
    console.error('[admin/backfill-dimensions]', error)
    return NextResponse.json({ error: 'Backfill failed', tagged }, { status: 500 })
  }
}
