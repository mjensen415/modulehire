import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { checkAndLog } from '@/lib/rate-limit'
import { sealSecret } from '@/lib/business/secret-box'
import { GreenhouseError, verifyCredentials } from '@/lib/business/greenhouse'
import { canManageIntegrations, clientIdHint } from '@/lib/business/integrations'

// POST { org_id, client_id, client_secret, writeback_enabled? } — owners/admins. Checks the
// Harvest v3 credential against Greenhouse before saving it, encrypted. Status, the write-back
// switch and disconnect live on /api/business/integrations.
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
  const limit = await checkAndLog(supabase, user.id, 'rl_biz_ats_connect', 10, 3600)
  if (!limit.ok) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })

  const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : ''
  const clientSecret = typeof body.client_secret === 'string' ? body.client_secret.trim() : ''
  if (clientId.length < 4 || clientId.length > 200 || clientSecret.length < 8 || clientSecret.length > 500) {
    return NextResponse.json({ error: 'Paste both the client ID and the client secret from Greenhouse.' }, { status: 400 })
  }
  try {
    await verifyCredentials({ clientId, clientSecret })
  } catch (e) {
    return NextResponse.json({ error: e instanceof GreenhouseError ? e.message : 'Could not reach Greenhouse. Try again.' }, { status: 400 })
  }

  const admin = await createAdminClient()
  const { error } = await admin.from('org_integrations').upsert(
    {
      org_id: orgId, provider: 'greenhouse', client_id: clientId, secret_ciphertext: sealSecret(clientSecret),
      writeback_enabled: body.writeback_enabled !== false, status: 'connected', last_error: null, config: {},
      connected_by: user.id, updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,provider' },
  )
  if (error) {
    console.error('[integrations/greenhouse POST]', error)
    return NextResponse.json({ error: 'Could not save the connection.' }, { status: 500 })
  }
  await admin.from('usage_events').insert({ user_id: user.id, action: 'ev_biz_ats_connect', metadata: { org_id: orgId, provider: 'greenhouse' } })
  return NextResponse.json({ connected: true, hint: `client ${clientIdHint(clientId)}` })
}
