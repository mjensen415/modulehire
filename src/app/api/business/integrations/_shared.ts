import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isUuid } from '@/lib/validate'
import { getOrgRole } from '@/lib/business/org-access'
import { GreenhouseError } from '@/lib/business/greenhouse'
import { WorkableError } from '@/lib/business/workable'
import {
  PROVIDER_LABEL,
  loadGreenhouse,
  loadWorkable,
  markIntegrationError,
  type GreenhouseConnection,
  type Provider,
  type WorkableConnection,
} from '@/lib/business/integrations'

async function resolveOrg(supabase: SupabaseClient, userId: string, ids: { orgId?: unknown; jobId?: unknown }) {
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

function notReady(provider: Provider, conn: { secret: string; lastError: string | null } | null) {
  const label = PROVIDER_LABEL[provider]
  if (!conn) return NextResponse.json({ error: `${label} is not connected. Connect it in Settings.`, code: 'not_connected' }, { status: 409 })
  if (!conn.secret) return NextResponse.json({ error: conn.lastError ?? `Reconnect ${label} in Settings.`, code: 'reconnect' }, { status: 409 })
  return null
}

export async function greenhouseContext(supabase: SupabaseClient, admin: SupabaseClient, userId: string, ids: { orgId?: unknown; jobId?: unknown }):
  Promise<{ ok: true; orgId: string; conn: GreenhouseConnection } | { ok: false; res: NextResponse }> {
  const org = await resolveOrg(supabase, userId, ids)
  if (!org.ok) return org
  const conn = await loadGreenhouse(admin, org.orgId)
  const bad = notReady('greenhouse', conn)
  if (bad || !conn) return { ok: false, res: bad! }
  return { ok: true, orgId: org.orgId, conn }
}

export async function workableContext(supabase: SupabaseClient, admin: SupabaseClient, userId: string, ids: { orgId?: unknown; jobId?: unknown }):
  Promise<{ ok: true; orgId: string; conn: WorkableConnection } | { ok: false; res: NextResponse }> {
  const org = await resolveOrg(supabase, userId, ids)
  if (!org.ok) return org
  const conn = await loadWorkable(admin, org.orgId)
  const bad = notReady('workable', conn)
  if (bad || !conn) return { ok: false, res: bad! }
  return { ok: true, orgId: org.orgId, conn }
}

export { resolveOrg }

/** Turns a provider failure into a response, and marks the connection when the key is bad. */
export async function providerFailure(admin: SupabaseClient, orgId: string, provider: Provider, e: unknown, where: string) {
  if (e instanceof GreenhouseError || e instanceof WorkableError) {
    if (e.kind === 'auth' || e.kind === 'scope') await markIntegrationError(admin, orgId, provider, e.message)
    return NextResponse.json({ error: e.message, code: `${provider}_${e.kind}` }, { status: e.kind === 'rate' ? 429 : 502 })
  }
  console.error(`[integrations/${provider} ${where}]`, e)
  return NextResponse.json({ error: `Something went wrong talking to ${PROVIDER_LABEL[provider]}.` }, { status: 500 })
}

export const greenhouseFailure = (admin: SupabaseClient, orgId: string, e: unknown, where: string) =>
  providerFailure(admin, orgId, 'greenhouse', e, where)
