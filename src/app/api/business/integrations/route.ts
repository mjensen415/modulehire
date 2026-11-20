import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { PROVIDERS, isProvider } from '@/lib/business/ats/registry'
import { ADAPTERS } from '@/lib/business/ats/adapters'
import { canManageIntegrations, loadIntegration } from '@/lib/business/integrations'
import { resolveOrg } from './_shared'

// GET ?org_id= | ?job_id= — every ATS connection's status (never a secret). With job_id, also
// which ATS job that posting was linked to.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const jobId = url.searchParams.get('job_id')
  const org = await resolveOrg(supabase, user.id, { orgId: url.searchParams.get('org_id'), jobId })
  if (!org.ok) return org.res

  const admin = await createAdminClient()
  const integrations: Record<string, unknown> = {}
  for (const p of PROVIDERS) {
    const c = await loadIntegration(admin, org.orgId, p)
    integrations[p] = c
      ? {
          connected: true, hint: c.hint, writeback_enabled: c.writebackEnabled, status: c.status, last_error: c.lastError,
          can_comment: ADAPTERS[p].canComment({ clientId: c.clientId, secret: '', config: c.config }),
        }
      : { connected: false }
  }
  let linked: { provider: string; external_id: string } | null = null
  if (isUuid(jobId)) {
    const { data } = await supabase.from('job_postings').select('external_source, external_id').eq('id', jobId).single()
    if (isProvider(data?.external_source) && data?.external_id) linked = { provider: data.external_source, external_id: String(data.external_id) }
  }
  return NextResponse.json({ org_id: org.orgId, can_manage: org.role === 'owner' || org.role === 'admin', integrations, linked })
}

// PATCH { org_id, provider, writeback_enabled } — owners/admins.
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (!isUuid(body.org_id) || !isProvider(body.provider) || typeof body.writeback_enabled !== 'boolean') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (!(await canManageIntegrations(supabase, body.org_id, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createAdminClient()
  const { error } = await admin
    .from('org_integrations')
    .update({ writeback_enabled: body.writeback_enabled, updated_at: new Date().toISOString() })
    .eq('org_id', body.org_id)
    .eq('provider', body.provider)
  if (error) return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
  return NextResponse.json({ writeback_enabled: body.writeback_enabled })
}

// DELETE ?org_id=&provider= — owners/admins. Removes the saved key; imported applicants stay.
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const orgId = url.searchParams.get('org_id')
  const provider = url.searchParams.get('provider')
  if (!isUuid(orgId) || !isProvider(provider)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  if (!(await canManageIntegrations(supabase, orgId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createAdminClient()
  await admin.from('org_integrations').delete().eq('org_id', orgId).eq('provider', provider)
  return NextResponse.json({ connected: false })
}
