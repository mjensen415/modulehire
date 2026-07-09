import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'

// Consolidate duplicate job_experience entries (from multiple resume uploads)
// into one. Modules and skills are re-pointed to the kept entry, then the
// merged entries are deleted.
//
// SCHEMA NOTE: modules link to job_experiences via the module_job_assignments
// join table (module_id, job_id) — there is NO modules.job_experience_id column.
// So "moving modules" means re-pointing module_job_assignments.job_id. Both
// module_job_assignments.job_id and job_skills.job_id are ON DELETE CASCADE to
// job_experiences, so modules/skills must be copied to keep_id BEFORE the merged
// entries are deleted.
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { keep_id, merge_ids } = await req.json()

    if (!isUuid(keep_id)) {
      return NextResponse.json({ error: 'Invalid keep_id' }, { status: 400 })
    }
    if (!Array.isArray(merge_ids) || merge_ids.length === 0 || !merge_ids.every(isUuid)) {
      return NextResponse.json({ error: 'merge_ids must be a non-empty array of ids' }, { status: 400 })
    }
    if (merge_ids.includes(keep_id)) {
      return NextResponse.json({ error: 'merge_ids must not include keep_id' }, { status: 400 })
    }
    // Dedupe merge_ids defensively.
    const mergeIds: string[] = [...new Set(merge_ids as string[])]
    const allIds = [keep_id, ...mergeIds]

    const admin = await createAdminClient()

    // Ownership check: every id must belong to the authenticated user.
    const { data: owned, error: ownErr } = await admin
      .from('job_experiences')
      .select('id')
      .eq('user_id', user.id)
      .in('id', allIds)
    if (ownErr) throw ownErr
    if (!owned || owned.length !== allIds.length) {
      return NextResponse.json({ error: 'One or more experiences not found' }, { status: 404 })
    }

    // 1. Re-point modules: copy the merged entries' assignments onto keep_id
    //    (ON CONFLICT DO NOTHING via ignoreDuplicates), then drop the originals.
    const { data: mjaRows, error: mjaSelErr } = await admin
      .from('module_job_assignments')
      .select('module_id')
      .in('job_id', mergeIds)
    if (mjaSelErr) throw mjaSelErr
    if (mjaRows && mjaRows.length > 0) {
      const { error: mjaInsErr } = await admin
        .from('module_job_assignments')
        .upsert(
          mjaRows.map(r => ({ module_id: r.module_id, job_id: keep_id })),
          { onConflict: 'module_id,job_id', ignoreDuplicates: true },
        )
      if (mjaInsErr) throw mjaInsErr
    }
    const { error: mjaDelErr } = await admin
      .from('module_job_assignments')
      .delete()
      .in('job_id', mergeIds)
    if (mjaDelErr) throw mjaDelErr

    // 2. Re-point skills: UNIQUE(job_id, name) means duplicates are skipped.
    const { data: skillRows, error: skillSelErr } = await admin
      .from('job_skills')
      .select('name, source, category, user_id')
      .in('job_id', mergeIds)
    if (skillSelErr) throw skillSelErr
    if (skillRows && skillRows.length > 0) {
      const { error: skillInsErr } = await admin
        .from('job_skills')
        .upsert(
          skillRows.map(s => ({ job_id: keep_id, name: s.name, source: s.source, category: s.category, user_id: s.user_id })),
          { onConflict: 'job_id,name', ignoreDuplicates: true },
        )
      if (skillInsErr) throw skillInsErr
    }
    const { error: skillDelErr } = await admin
      .from('job_skills')
      .delete()
      .in('job_id', mergeIds)
    if (skillDelErr) throw skillDelErr

    // 3. Delete the merged entries.
    const { error: jobDelErr } = await admin
      .from('job_experiences')
      .delete()
      .in('id', mergeIds)
    if (jobDelErr) throw jobDelErr

    return NextResponse.json({ success: true, merged_count: mergeIds.length })
  } catch (error) {
    console.error('[merge-experiences]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
