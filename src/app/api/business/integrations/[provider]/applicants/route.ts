import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { checkAndLog } from '@/lib/rate-limit'
import { atsContext, providerFailure, providerParam, type ProviderRouteContext } from '../../_shared'

export const maxDuration = 120

// POST { job_id, ats_job_id } — active candidates on an ATS job for the import list, with
// already-imported flags. Also links the ModuleHire posting to that ATS job.
export async function POST(req: Request, { params }: ProviderRouteContext) {
  const provider = providerParam((await params).provider)
  if (!provider) return NextResponse.json({ error: 'Unknown integration' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const atsJobId = typeof body.ats_job_id === 'string' || typeof body.ats_job_id === 'number' ? String(body.ats_job_id) : ''
  if (!isUuid(body.job_id)) return NextResponse.json({ error: 'Invalid job_id' }, { status: 400 })
  const jobId = body.job_id as string
  const admin = await createAdminClient()
  const ctx = await atsContext(supabase, admin, user.id, provider, { jobId })
  if (!ctx.ok) return ctx.res
  if (!ctx.adapter.validJobId(atsJobId)) return NextResponse.json({ error: 'Invalid ats_job_id' }, { status: 400 })
  const limit = await checkAndLog(supabase, user.id, 'rl_biz_ats_list', 40, 3600)
  if (!limit.ok) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })

  try {
    const list = await ctx.adapter.listApplicants(ctx.c, atsJobId)
    const { data: existing } = await admin.from('applicants').select('external_source, external_id, email').eq('job_id', jobId)
    const importedIds = new Set((existing ?? []).filter((a) => a.external_source === provider && a.external_id).map((a) => String(a.external_id)))
    const importedEmails = new Set((existing ?? []).map((a) => (a.email as string | null)?.toLowerCase()).filter(Boolean))
    await admin.from('job_postings').update({ external_source: provider, external_id: atsJobId }).eq('id', jobId)
    return NextResponse.json({
      applicants: list.map((a) => ({
        ...a,
        already_imported: importedIds.has(a.key) || (!!a.email && importedEmails.has(a.email.toLowerCase())),
      })),
      writeback_enabled: ctx.conn.writebackEnabled && ctx.adapter.canComment(ctx.c),
    })
  } catch (e) {
    return providerFailure(admin, ctx.orgId, provider, e, 'applicants')
  }
}
