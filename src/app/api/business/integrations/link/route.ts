import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { getOrgRole } from '@/lib/business/org-access'
import { isProvider } from '@/lib/business/integrations'

// POST { job_id, provider, external_id } — remembers which ATS job a posting came from, so the
// import dialog opens on it. Set when a posting is started from an ATS job.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const ext = typeof body.external_id === 'string' || typeof body.external_id === 'number' ? String(body.external_id) : ''
  if (!isUuid(body.job_id) || !isProvider(body.provider) || !/^[A-Za-z0-9_-]{1,64}$/.test(ext)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { data: job } = await supabase.from('job_postings').select('id, org_id').eq('id', body.job_id as string).single()
  if (!job || !(await getOrgRole(supabase, job.org_id, user.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const admin = await createAdminClient()
  await admin.from('job_postings').update({ external_source: body.provider, external_id: ext }).eq('id', job.id)
  return NextResponse.json({ linked: true })
}
