import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isUuid } from '@/lib/validate'
import { getOrgRole } from '@/lib/business/org-access'
import { GreenhouseError } from '@/lib/business/greenhouse'
import { loadGreenhouse, markGreenhouseError, type GreenhouseConnection } from '@/lib/business/integrations'

/** Resolves the org from org_id or job_id, checks membership, and loads the Greenhouse connection. */
export async function greenhouseContext(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  ids: { orgId?: unknown; jobId?: unknown },
): Promise<{ ok: true; orgId: string; conn: GreenhouseConnection } | { ok: false; res: NextResponse }> {
  let orgId: string | null = isUuid(ids.orgId) ? (ids.orgId as string) : null
  if (!orgId && isUuid(ids.jobId)) {
    const { data } = await supabase.from('job_postings').select('org_id').eq('id', ids.jobId as string).single()
    orgId = (data?.org_id as string | undefined) ?? null
  }
  if (!orgId) return { ok: false, res: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  const role = await getOrgRole(supabase, orgId, userId)
  if (!role) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const conn = await loadGreenhouse(admin, orgId)
  if (!conn) return { ok: false, res: NextResponse.json({ error: 'Greenhouse is not connected. Connect it in Settings.', code: 'not_connected' }, { status: 409 }) }
  if (!conn.creds.clientSecret) return { ok: false, res: NextResponse.json({ error: conn.lastError ?? 'Reconnect Greenhouse in Settings.', code: 'reconnect' }, { status: 409 }) }
  return { ok: true, orgId, conn }
}

/** Turns a Greenhouse failure into a response, and marks the connection when the credential is bad. */
export async function greenhouseFailure(admin: SupabaseClient, orgId: string, e: unknown, where: string) {
  if (e instanceof GreenhouseError) {
    if (e.kind === 'auth' || e.kind === 'scope') await markGreenhouseError(admin, orgId, e.message)
    return NextResponse.json({ error: e.message, code: `greenhouse_${e.kind}` }, { status: e.kind === 'rate' ? 429 : 502 })
  }
  console.error(`[integrations/greenhouse ${where}]`, e)
  return NextResponse.json({ error: 'Something went wrong talking to Greenhouse.' }, { status: 500 })
}
