import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isUuid } from '@/lib/validate'
import { getOrgRole } from '@/lib/business/org-access'
import { AtsError } from '@/lib/business/ats/http'
import { ADAPTERS } from '@/lib/business/ats/adapters'
import { PROVIDER_INFO, isProvider, type Provider } from '@/lib/business/ats/registry'
import type { Adapter, AtsConn } from '@/lib/business/ats/types'
import { loadIntegration, markIntegrationError, type Connection } from '@/lib/business/integrations'

export async function resolveOrg(supabase: SupabaseClient, userId: string, ids: { orgId?: unknown; jobId?: unknown }) {
  let orgId: string | null = isUuid(ids.orgId) ? (ids.orgId as string) : null
  if (!orgId && isUuid(ids.jobId)) {
    const { data } = await supabase.from('job_postings').select('org_id').eq('id', ids.jobId as string).single()
    orgId = (data?.org_id as string | undefined) ?? null
  }
  if (!orgId) return { ok: false as const, res: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  const role = await getOrgRole(supabase, orgId, userId)
  if (!role) return { ok: false as const, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  return { ok: true as const, orgId, role }
}

export function providerParam(raw: string): Provider | null {
  return isProvider(raw) ? raw : null
}

/** Resolves the org (from org_id or job_id), checks membership, and loads a usable connection. */
export async function atsContext(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  provider: Provider,
  ids: { orgId?: unknown; jobId?: unknown },
): Promise<{ ok: true; orgId: string; conn: Connection; c: AtsConn; adapter: Adapter } | { ok: false; res: NextResponse }> {
  const org = await resolveOrg(supabase, userId, ids)
  if (!org.ok) return org
  const conn = await loadIntegration(admin, org.orgId, provider)
  const label = PROVIDER_INFO[provider].label
  if (!conn) return { ok: false, res: NextResponse.json({ error: `${label} is not connected. Connect it in Settings.`, code: 'not_connected' }, { status: 409 }) }
  if (!conn.secret) return { ok: false, res: NextResponse.json({ error: conn.lastError ?? `Reconnect ${label} in Settings.`, code: 'reconnect' }, { status: 409 }) }
  return { ok: true, orgId: org.orgId, conn, c: { clientId: conn.clientId, secret: conn.secret, config: conn.config }, adapter: ADAPTERS[provider] }
}

/** Turns a provider failure into a response, and marks the connection when the key is bad. */
export async function providerFailure(admin: SupabaseClient, orgId: string, provider: Provider, e: unknown, where: string) {
  if (e instanceof AtsError) {
    if (e.kind === 'auth' || e.kind === 'scope') await markIntegrationError(admin, orgId, provider, e.message)
    return NextResponse.json({ error: e.message, code: `${provider}_${e.kind}` }, { status: e.kind === 'rate' ? 429 : 502 })
  }
  console.error(`[integrations/${provider} ${where}]`, e)
  return NextResponse.json({ error: `Something went wrong talking to ${PROVIDER_INFO[provider].label}.` }, { status: 500 })
}

type Ctx = { params: Promise<{ provider: string }> }
export type { Ctx as ProviderRouteContext }
