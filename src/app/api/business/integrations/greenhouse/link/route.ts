import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { getOrgRole } from '@/lib/business/org-access'

// POST { job_id, gh_job_id } — remembers which Greenhouse job a posting came from, so the import
// dialog opens on it. Set when a posting is started from a Greenhouse job.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const ghJobId = Number(body.gh_job_id)
  if (!isUuid(body.job_id) || !Number.isSafeInteger(ghJobId) || ghJobId <= 0) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { data: job } = await supabase.from('job_postings').select('id, org_id').eq('id', body.job_id as string).single()
  if (!job || !(await getOrgRole(supabase, job.org_id, user.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const admin = await createAdminClient()
  await admin.from('job_postings').update({ external_source: 'greenhouse', external_id: String(ghJobId) }).eq('id', job.id)
  return NextResponse.json({ linked: true })
}
