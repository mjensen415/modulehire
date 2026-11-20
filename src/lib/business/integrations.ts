// Org-level ATS connections (org_integrations). The table has no grants for signed-in users:
// routes check the caller's org role with their own client, then use the service role here.
// client_id holds the account identifier (Greenhouse client id, Workable subdomain, BambooHR
// domain, or a key hint for Lever/Ashby); secret_ciphertext the key; config provider extras.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgRole } from './org-access'
import { openSecret } from './secret-box'
import { PROVIDER_INFO, isProvider, type Provider } from './ats/registry'
import { ADAPTERS } from './ats/adapters'

export { isProvider, type Provider }

export type Connection = {
  provider: Provider
  clientId: string
  secret: string // '' when it can't be decrypted
  writebackEnabled: boolean
  config: Record<string, unknown>
  hint: string
  status: 'connected' | 'error'
  lastError: string | null
}

export const BUSINESS_APP_URL = 'https://business.modulehire.com'

/** Owners and admins manage connections; any member can import through one. */
export async function canManageIntegrations(supabase: SupabaseClient, orgId: string, userId: string) {
  const role = await getOrgRole(supabase, orgId, userId)
  return role === 'owner' || role === 'admin'
}

export async function loadIntegration(admin: SupabaseClient, orgId: string, provider: Provider): Promise<Connection | null> {
  const { data } = await admin
    .from('org_integrations')
    .select('client_id, secret_ciphertext, writeback_enabled, status, last_error, config')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .maybeSingle()
  if (!data) return null
  const clientId = data.client_id as string
  let secret = ''
  let status = data.status as 'connected' | 'error'
  let lastError = (data.last_error as string | null) ?? null
  try {
    secret = openSecret(data.secret_ciphertext as string)
  } catch {
    status = 'error'
    lastError = `The saved key can no longer be read. Reconnect ${PROVIDER_INFO[provider].label}.`
  }
  return {
    provider,
    clientId,
    secret,
    writebackEnabled: !!data.writeback_enabled,
    config: (data.config as Record<string, unknown> | null) ?? {},
    hint: ADAPTERS[provider].hint(clientId),
    status,
    lastError,
  }
}

export async function markIntegrationError(admin: SupabaseClient, orgId: string, provider: Provider, message: string | null) {
  await admin
    .from('org_integrations')
    .update({ status: message ? 'error' : 'connected', last_error: message, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('provider', provider)
}

export function scoreNote(input: { score: number | null; dealbreaker: boolean; headline: string | null; jobId: string; jobTitle: string }) {
  return [
    `ModuleHire score: ${input.score ?? 'not scored'}/100 for ${input.jobTitle}`,
    input.dealbreaker ? 'Misses at least one dealbreaker requirement.' : null,
    input.headline ? `Summary: ${input.headline}` : null,
    `Evidence for each requirement: ${BUSINESS_APP_URL}/business/jobs/${input.jobId}`,
    'Scored by AI from the resume. Use it as one input; a person makes the decision.',
  ].filter(Boolean).join('\n')
}
