import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { checkAndLog } from '@/lib/rate-limit'
import { listJobApplicants } from '@/lib/business/greenhouse'
import { greenhouseContext, greenhouseFailure } from '../_shared'

export const maxDuration = 120

// POST { job_id, gh_job_id } — in-process applications on a Greenhouse job, for the import list:
// name, email, stage, whether there's a resume, whether they opted out of AI review, and whether
// they're already on this ModuleHire posting. Also links the posting to that Greenhouse job.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const ghJobId = Number(body.gh_job_id)
  if (!isUuid(body.job_id) || !Number.isSafeInteger(ghJobId) || ghJobId <= 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const jobId = body.job_id as string
  const admin = await createAdminClient()
  const ctx = await greenhouseContext(supabase, admin, user.id, { jobId })
  if (!ctx.ok) return ctx.res
  const limit = await checkAndLog(supabase, user.id, 'rl_biz_gh_list', 40, 3600)
  if (!limit.ok) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })

  try {
    const list = await listJobApplicants(ctx.conn.creds, ghJobId)
    const { data: existing } = await admin
      .from('applicants')
      .select('external_id, email')
      .eq('job_id', jobId)
    const importedIds = new Set((existing ?? []).filter((a) => a.external_id).map((a) => String(a.external_id)))
    const importedEmails = new Set((existing ?? []).map((a) => (a.email as string | null)?.toLowerCase()).filter(Boolean))
    await admin.from('job_postings').update({ external_source: 'greenhouse', external_id: String(ghJobId) }).eq('id', jobId)
    return NextResponse.json({
      applicants: list.map((a) => ({
        ...a,
        already_imported: importedIds.has(String(a.application_id)) || (!!a.email && importedEmails.has(a.email.toLowerCase())),
      })),
      writeback_enabled: ctx.conn.writebackEnabled,
    })
  } catch (e) {
    return greenhouseFailure(admin, ctx.orgId, e, 'applicants')
  }
}
