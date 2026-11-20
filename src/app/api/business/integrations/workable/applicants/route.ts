import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { checkAndLog } from '@/lib/rate-limit'
import { isShortcode, listWorkableApplicants } from '@/lib/business/workable'
import { providerFailure, workableContext } from '../../_shared'

export const maxDuration = 120

// POST { job_id, shortcode } — active candidates on a Workable job for the import list, with
// already-imported flags. Also links the posting to that Workable job.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (!isUuid(body.job_id) || !isShortcode(body.shortcode)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const jobId = body.job_id as string
  const admin = await createAdminClient()
  const ctx = await workableContext(supabase, admin, user.id, { jobId })
  if (!ctx.ok) return ctx.res
  const limit = await checkAndLog(supabase, user.id, 'rl_biz_ats_list', 40, 3600)
  if (!limit.ok) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })

  try {
    const list = await listWorkableApplicants(ctx.conn.creds, body.shortcode)
    const { data: existing } = await admin.from('applicants').select('external_source, external_id, email').eq('job_id', jobId)
    const importedIds = new Set((existing ?? []).filter((a) => a.external_source === 'workable' && a.external_id).map((a) => String(a.external_id)))
    const importedEmails = new Set((existing ?? []).map((a) => (a.email as string | null)?.toLowerCase()).filter(Boolean))
    await admin.from('job_postings').update({ external_source: 'workable', external_id: body.shortcode }).eq('id', jobId)
    return NextResponse.json({
      applicants: list.map((a) => ({
        ...a,
        opted_out: false,
        already_imported: importedIds.has(a.candidate_id) || (!!a.email && importedEmails.has(a.email.toLowerCase())),
      })),
      writeback_enabled: ctx.conn.writebackEnabled && !!ctx.conn.config.member_id,
    })
  } catch (e) {
    return providerFailure(admin, ctx.orgId, 'workable', e, 'applicants')
  }
}
