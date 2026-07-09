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
//
// dry_run: true returns the skill conflicts (same name, different non-null
// category on each side) without mutating anything, so the UI can ask the user
// which category to keep. skill_resolutions maps skill name → 'keep_existing' |
// 'use_new' and is applied to the surviving skill.

type SkillRow = { name: string; source: string; category: string | null; user_id: string }
type Resolution = 'keep_existing' | 'use_new'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { keep_id, merge_ids, dry_run } = body
    const skill_resolutions: Record<string, Resolution> = body.skill_resolutions ?? {}

    if (!isUuid(keep_id)) {
      return NextResponse.json({ error: 'Invalid keep_id' }, { status: 400 })
    }
    if (!Array.isArray(merge_ids) || merge_ids.length === 0 || !merge_ids.every(isUuid)) {
      return NextResponse.json({ error: 'merge_ids must be a non-empty array of ids' }, { status: 400 })
    }
    if (merge_ids.includes(keep_id)) {
      return NextResponse.json({ error: 'merge_ids must not include keep_id' }, { status: 400 })
    }
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

    // Load skills on both sides up front (needed for conflict detection + merge).
    const { data: keepSkills, error: keepSkErr } = await admin
      .from('job_skills').select('name, source, category, user_id').eq('job_id', keep_id)
    if (keepSkErr) throw keepSkErr
    const { data: mergeSkills, error: mergeSkErr } = await admin
      .from('job_skills').select('name, source, category, user_id').in('job_id', mergeIds)
    if (mergeSkErr) throw mergeSkErr

    const keepByName = new Map<string, SkillRow>()
    for (const s of (keepSkills ?? []) as SkillRow[]) keepByName.set(s.name, s)

    // A conflict is same name with two different NON-NULL categories.
    const skill_conflicts: { name: string; new_source: string; existing_source: string; new_category: string | null; existing_category: string | null }[] = []
    const seenConflict = new Set<string>()
    for (const s of (mergeSkills ?? []) as SkillRow[]) {
      const k = keepByName.get(s.name)
      if (k && k.category && s.category && k.category !== s.category && !seenConflict.has(s.name)) {
        seenConflict.add(s.name)
        skill_conflicts.push({
          name: s.name,
          existing_source: k.source, new_source: s.source,
          existing_category: k.category, new_category: s.category,
        })
      }
    }

    if (dry_run) {
      return NextResponse.json({ skill_conflicts })
    }

    // ── 1. Re-point modules ────────────────────────────────────────────────────
    const { data: mjaRows, error: mjaSelErr } = await admin
      .from('module_job_assignments').select('module_id').in('job_id', mergeIds)
    if (mjaSelErr) throw mjaSelErr
    if (mjaRows && mjaRows.length > 0) {
      const { error: mjaInsErr } = await admin
        .from('module_job_assignments')
        .upsert(mjaRows.map(r => ({ module_id: r.module_id, job_id: keep_id })), { onConflict: 'module_id,job_id', ignoreDuplicates: true })
      if (mjaInsErr) throw mjaInsErr
    }
    const { error: mjaDelErr } = await admin.from('module_job_assignments').delete().in('job_id', mergeIds)
    if (mjaDelErr) throw mjaDelErr

    // ── 2. Merge skills ────────────────────────────────────────────────────────
    // Build the final skill set for keep_id. Upsert-with-update preserves keep's
    // existing rows (and their skill_module_assignments), updating only category
    // where a resolution or a null→non-null promotion applies.
    const finalByName = new Map<string, SkillRow>()
    for (const s of (keepSkills ?? []) as SkillRow[]) finalByName.set(s.name, { ...s })
    for (const s of (mergeSkills ?? []) as SkillRow[]) {
      const existing = finalByName.get(s.name)
      if (!existing) { finalByName.set(s.name, { ...s }); continue }
      if (existing.category && s.category && existing.category !== s.category) {
        // Conflict → honor the user's resolution (default: keep existing).
        if (skill_resolutions[s.name] === 'use_new') existing.category = s.category
      } else {
        // No conflict → prefer the non-null category.
        existing.category = existing.category ?? s.category
      }
    }
    const rows = [...finalByName.values()].map(s => ({ job_id: keep_id, name: s.name, source: s.source, category: s.category, user_id: s.user_id }))
    if (rows.length > 0) {
      const { error: skillUpErr } = await admin.from('job_skills').upsert(rows, { onConflict: 'job_id,name' })
      if (skillUpErr) throw skillUpErr
    }
    const { error: skillDelErr } = await admin.from('job_skills').delete().in('job_id', mergeIds)
    if (skillDelErr) throw skillDelErr

    // ── 3. Delete the merged entries ───────────────────────────────────────────
    const { error: jobDelErr } = await admin.from('job_experiences').delete().in('id', mergeIds)
    if (jobDelErr) throw jobDelErr

    return NextResponse.json({ success: true, merged_count: mergeIds.length })
  } catch (error) {
    console.error('[merge-experiences]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
