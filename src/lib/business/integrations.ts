// Org-level ATS connections (org_integrations). The table has no grants for signed-in users:
// routes check the caller's org role with their own client, then use the service role here.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgRole } from './org-access'
import { openSecret } from './secret-box'
import type { GhCreds } from './greenhouse'

export type GreenhouseConnection = {
  creds: GhCreds
  writebackEnabled: boolean
  clientIdHint: string
  status: 'connected' | 'error'
  lastError: string | null
}

export const BUSINESS_APP_URL = 'https://business.modulehire.com'

export const clientIdHint = (id: string) => (id.length > 6 ? `…${id.slice(-4)}` : '…')

/** Owners and admins manage connections; any member can import through one. */
export async function canManageIntegrations(supabase: SupabaseClient, orgId: string, userId: string) {
  const role = await getOrgRole(supabase, orgId, userId)
  return role === 'owner' || role === 'admin'
}

export async function loadGreenhouse(admin: SupabaseClient, orgId: string): Promise<GreenhouseConnection | null> {
  const { data } = await admin
    .from('org_integrations')
    .select('client_id, secret_ciphertext, writeback_enabled, status, last_error')
    .eq('org_id', orgId)
    .eq('provider', 'greenhouse')
    .maybeSingle()
  if (!data) return null
  let secret = ''
  try {
    secret = openSecret(data.secret_ciphertext as string)
  } catch {
    return {
      creds: { clientId: data.client_id as string, clientSecret: '' },
      writebackEnabled: !!data.writeback_enabled,
      clientIdHint: clientIdHint(data.client_id as string),
      status: 'error',
      lastError: 'The saved secret can no longer be read. Reconnect Greenhouse.',
    }
  }
  return {
    creds: { clientId: data.client_id as string, clientSecret: secret },
    writebackEnabled: !!data.writeback_enabled,
    clientIdHint: clientIdHint(data.client_id as string),
    status: data.status as 'connected' | 'error',
    lastError: (data.last_error as string | null) ?? null,
  }
}

export async function markGreenhouseError(admin: SupabaseClient, orgId: string, message: string | null) {
  await admin
    .from('org_integrations')
    .update({ status: message ? 'error' : 'connected', last_error: message, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('provider', 'greenhouse')
}
