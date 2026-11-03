import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/server'
import { analyzeLibrary } from '@/lib/library-health'
import { loadLibraries } from './load'

export const maxDuration = 60

// GET — per-user library damage counts (read-only). Fixes are previewed and applied per user.
export async function GET() {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  try {
    const admin = await createAdminClient()
    const { modules, jobs, links } = await loadLibraries(admin)
    const userIds = [...new Set(modules.map(m => m.user_id))]
    const { data: users } = await admin.from('users').select('id, email, name').in('id', userIds)
    // The audit table may not exist yet (migration not applied): the overview still works.
    const { data: repairs } = await admin.from('library_repairs').select('id, user_id, created_at, undone_at, applied_by').order('created_at', { ascending: false }).limit(200)

    const rows = userIds.map(id => {
      const report = analyzeLibrary(modules.filter(m => m.user_id === id), jobs.filter(j => j.user_id === id), links)
      const u = users?.find(x => x.id === id)
      return {
        user_id: id,
        email: u?.email ?? id,
        name: u?.name ?? null,
        modules: report.modules,
        jobs: report.jobs,
        unlinked: report.unlinked.length,
        multi_company: report.multiCompany.length,
        duplicates: report.duplicates.reduce((n, d) => n + d.hide.length, 0),
        wide_jobs: report.wideJobs.length,
        repairs: (repairs ?? []).filter(r => r.user_id === id),
      }
    }).sort((a, b) => (b.unlinked + b.multi_company + b.duplicates + b.wide_jobs) - (a.unlinked + a.multi_company + a.duplicates + a.wide_jobs))

    return NextResponse.json({ users: rows, audit_table: repairs !== null })
  } catch (error) {
    console.error('[admin/library-health]', error)
    return NextResponse.json({ error: 'Could not load library health.' }, { status: 500 })
  }
}
