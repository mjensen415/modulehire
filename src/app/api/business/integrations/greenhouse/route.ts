import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { checkAndLog } from '@/lib/rate-limit'
import { getOrgRole } from '@/lib/business/org-access'
import { sealSecret } from '@/lib/business/secret-box'
import { GreenhouseError, GREENHOUSE_SCOPES, verifyCredentials } from '@/lib/business/greenhouse'
import { canManageIntegrations, clientIdHint, loadGreenhouse } from '@/lib/business/integrations'

async function orgFromRequest(supabase: Awaited<ReturnType<typeof createClient>>, url: URL, body?: Record<string, unknown>) {
  const orgId = (body?.org_id ?? url.searchParams.get('org_id')) as string | null
  if (isUuid(orgId)) return orgId
  const jobId = (body?.job_id ?? url.searchParams.get('job_id')) as string | null
  if (isUuid(jobId)) {
    const { data } = await supabase.from('job_postings').select('org_id').eq('id', jobId).single()
    return (data?.org_id as string | undefined) ?? null
  }
  return null
}

// GET ?org_id= | ?job_id= — connection status (never the secret). With job_id, also the
// Greenhouse job that posting was last imported from.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const orgId = await orgFromRequest(supabase, url)
  if (!orgId) return NextResponse.json({ error: 'Invalid org_id' }, { status: 400 })
  const role = await getOrgRole(supabase, orgId, user.id)
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await createAdminClient()
  const conn = await loadGreenhouse(admin, orgId)
  let linkedGhJobId: string | null = null
  const jobId = url.searchParams.get('job_id')
  if (conn && isUuid(jobId)) {
    const { data } = await supabase.from('job_postings').select('external_source, external_id').eq('id', jobId).single()
    if (data?.external_source === 'greenhouse') linkedGhJobId = (data.external_id as string | null) ?? null
  }
  return NextResponse.json({
    connected: !!conn,
    can_manage: role === 'owner' || role === 'admin',
    client_id_hint: conn?.clientIdHint ?? null,
    writeback_enabled: conn?.writebackEnabled ?? true,
    status: conn?.status ?? null,
    last_error: conn?.lastError ?? null,
    linked_gh_job_id: linkedGhJobId,
    scopes: GREENHOUSE_SCOPES,
  })
}

// POST { org_id, client_id, client_secret, writeback_enabled? } — owners/admins. Checks the
// credential against Greenhouse before saving it, encrypted.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const orgId = body.org_id
  if (!isUuid(orgId)) return NextResponse.json({ error: 'Invalid org_id' }, { status: 400 })
  if (!(await canManageIntegrations(supabase, orgId, user.id))) {
    return NextResponse.json({ error: 'Only an owner or admin can connect Greenhouse.' }, { status: 403 })
  }
  const limit = await checkAndLog(supabase, user.id, 'rl_biz_gh_connect', 10, 3600)
  if (!limit.ok) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })

  const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : ''
  const clientSecret = typeof body.client_secret === 'string' ? body.client_secret.trim() : ''
  if (clientId.length < 4 || clientId.length > 200 || clientSecret.length < 8 || clientSecret.length > 500) {
    return NextResponse.json({ error: 'Paste both the client ID and the client secret from Greenhouse.' }, { status: 400 })
  }

  try {
    await verifyCredentials({ clientId, clientSecret })
  } catch (e) {
    const msg = e instanceof GreenhouseError ? e.message : 'Could not reach Greenhouse. Try again.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const admin = await createAdminClient()
  const { error } = await admin.from('org_integrations').upsert(
    {
      org_id: orgId,
      provider: 'greenhouse',
      client_id: clientId,
      secret_ciphertext: sealSecret(clientSecret),
      writeback_enabled: body.writeback_enabled !== false,
      status: 'connected',
      last_error: null,
      connected_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,provider' },
  )
  if (error) {
    console.error('[integrations/greenhouse POST]', error)
    return NextResponse.json({ error: 'Could not save the connection.' }, { status: 500 })
  }
  await admin.from('usage_events').insert({ user_id: user.id, action: 'ev_biz_gh_connect', metadata: { org_id: orgId } })
  return NextResponse.json({ connected: true, client_id_hint: clientIdHint(clientId) })
}

// PATCH { org_id, writeback_enabled } — owners/admins.
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const orgId = body.org_id
  if (!isUuid(orgId) || typeof body.writeback_enabled !== 'boolean') return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  if (!(await canManageIntegrations(supabase, orgId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createAdminClient()
  const { error } = await admin
    .from('org_integrations')
    .update({ writeback_enabled: body.writeback_enabled, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('provider', 'greenhouse')
  if (error) return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
  return NextResponse.json({ writeback_enabled: body.writeback_enabled })
}

// DELETE ?org_id= — owners/admins. Removes the saved credential; imported applicants stay.
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const orgId = new URL(req.url).searchParams.get('org_id')
  if (!isUuid(orgId)) return NextResponse.json({ error: 'Invalid org_id' }, { status: 400 })
  if (!(await canManageIntegrations(supabase, orgId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createAdminClient()
  await admin.from('org_integrations').delete().eq('org_id', orgId).eq('provider', 'greenhouse')
  return NextResponse.json({ connected: false })
}
