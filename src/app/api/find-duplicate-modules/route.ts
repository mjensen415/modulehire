import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'

// After a merge, a kept job may hold content-duplicate modules (two uploads of
// the same resume). Flag near-identical modules by Jaccard word overlap — no AI.
const SIMILARITY_THRESHOLD = 0.75

type Mod = { id: string; content: string | null }

function wordSet(content: string | null): Set<string> {
  return new Set(
    String(content ?? '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const w of a) if (b.has(w)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { job_experience_id } = await req.json()
    if (!isUuid(job_experience_id)) {
      return NextResponse.json({ error: 'Invalid job_experience_id' }, { status: 400 })
    }

    const admin = await createAdminClient()

    // Ownership check.
    const { data: job, error: jobErr } = await admin
      .from('job_experiences')
      .select('id')
      .eq('id', job_experience_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (jobErr) throw jobErr
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    // Modules assigned to this job.
    const { data: assignments, error: mjaErr } = await admin
      .from('module_job_assignments')
      .select('module_id')
      .eq('job_id', job_experience_id)
    if (mjaErr) throw mjaErr
    const moduleIds = [...new Set((assignments ?? []).map(a => a.module_id))]
    if (moduleIds.length < 2) return NextResponse.json({ duplicate_pairs: [] })

    const { data: modules, error: modErr } = await admin
      .from('modules')
      .select('id, content')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .in('id', moduleIds)
    if (modErr) throw modErr

    const mods = (modules ?? []) as Mod[]
    const sets = mods.map(m => wordSet(m.content))

    const duplicate_pairs: { module_a: Mod; module_b: Mod; similarity: number }[] = []
    for (let i = 0; i < mods.length; i++) {
      for (let j = i + 1; j < mods.length; j++) {
        const sim = jaccard(sets[i], sets[j])
        if (sim >= SIMILARITY_THRESHOLD) {
          duplicate_pairs.push({
            module_a: { id: mods[i].id, content: mods[i].content },
            module_b: { id: mods[j].id, content: mods[j].content },
            similarity: Math.round(sim * 100) / 100,
          })
        }
      }
    }
    // Most similar first.
    duplicate_pairs.sort((a, b) => b.similarity - a.similarity)

    return NextResponse.json({ duplicate_pairs })
  } catch (error) {
    console.error('[find-duplicate-modules]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
