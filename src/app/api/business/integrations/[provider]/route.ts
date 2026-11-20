import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { checkAndLog } from '@/lib/rate-limit'
import { sealSecret } from '@/lib/business/secret-box'
import { AtsError } from '@/lib/business/ats/http'
import { ADAPTERS } from '@/lib/business/ats/adapters'
import { PROVIDER_INFO } from '@/lib/business/ats/registry'
import { canManageIntegrations } from '@/lib/business/integrations'
import { providerParam, type ProviderRouteContext } from '../_shared'

// POST { org_id, account?, secret, writeback_enabled? } — owners/admins connect an ATS. The key is
// checked against the ATS before it's saved, encrypted. Status, the write-back switch and
// disconnect live on /api/business/integrations.
export async function POST(req: Request, { params }: ProviderRouteContext) {
  const provider = providerParam((await params).provider)
  if (!provider) return NextResponse.json({ error: 'Unknown integration' }, { status: 404 })
  const label = PROVIDER_INFO[provider].label
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const orgId = body.org_id
  if (!isUuid(orgId)) return NextResponse.json({ error: 'Invalid org_id' }, { status: 400 })
  if (!(await canManageIntegrations(supabase, orgId, user.id))) {
    return NextResponse.json({ error: `Only an owner or admin can connect ${label}.` }, { status: 403 })
  }
  const limit = await checkAndLog(supabase, user.id, 'rl_biz_ats_connect', 10, 3600)
  if (!limit.ok) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })

  const adapter = ADAPTERS[provider]
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const parsed = adapter.parseConnect({ account: str(body.account), secret: str(body.secret), secret2: str(body.secret2) })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const c = { clientId: parsed.clientId, secret: parsed.secret, config: {} }
  try {
    await adapter.verify(c)
  } catch (e) {
    return NextResponse.json({ error: e instanceof AtsError ? e.message : `Could not reach ${label}. Try again.` }, { status: 400 })
  }
  const config = adapter.afterConnect ? await adapter.afterConnect(c, user.email ?? null).catch(() => ({})) : {}

  const admin = await createAdminClient()
  const { error } = await admin.from('org_integrations').upsert(
    {
      org_id: orgId, provider, client_id: parsed.clientId, secret_ciphertext: sealSecret(parsed.secret),
      writeback_enabled: body.writeback_enabled !== false, status: 'connected', last_error: null, config,
      connected_by: user.id, updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,provider' },
  )
  if (error) {
    console.error(`[integrations/${provider} POST]`, error)
    return NextResponse.json({ error: 'Could not save the connection.' }, { status: 500 })
  }
  await admin.from('usage_events').insert({ user_id: user.id, action: 'ev_biz_ats_connect', metadata: { org_id: orgId, provider } })
  return NextResponse.json({ connected: true, hint: adapter.hint(parsed.clientId), can_comment: adapter.canComment({ ...c, config }) })
}
