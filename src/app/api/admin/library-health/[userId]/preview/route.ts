import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { analyzeLibrary, planRepair } from '@/lib/library-health'
import { extractOutline, type OutlineRole } from '@/lib/parse-modules'
import { loadLibraries } from '../../load'

export const maxDuration = 120

type RouteContext = { params: Promise<{ userId: string }> }

// POST — exactly what "Apply fix" would change for this user. Writes nothing. Job dates come
// from re-reading the user's latest resume outline (one Haiku call).
export async function POST(_req: Request, { params }: RouteContext) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const { userId } = await params
  if (!isUuid(userId)) return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
  try {
    const admin = await createAdminClient()
    const { modules, jobs, links } = await loadLibraries(admin, userId)
    const report = analyzeLibrary(modules, jobs, links)

    let outline: OutlineRole[] = []
    const { data: resume } = await admin.from('resumes').select('raw_text').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (resume?.raw_text) outline = (await extractOutline(resume.raw_text, guard.user.id)).roles

    const ops = planRepair(report, modules, jobs, outline)
    return NextResponse.json({
      report: {
        modules: report.modules,
        jobs: report.jobs,
        unlinked: report.unlinked.length,
        multi_company: report.multiCompany.length,
        duplicates: report.duplicates.reduce((n, d) => n + d.hide.length, 0),
        wide_jobs: report.wideJobs,
      },
      ops,
      outline_roles: outline.length,
    })
  } catch (error) {
    console.error('[admin/library-health preview]', error)
    return NextResponse.json({ error: 'Could not build the preview.' }, { status: 500 })
  }
}
