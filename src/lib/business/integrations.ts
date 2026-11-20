// Org-level ATS connections (org_integrations). The table has no grants for signed-in users:
// routes check the caller's org role with their own client, then use the service role here.
// Per provider: Greenhouse client_id = OAuth client id, secret = client secret;
// Workable client_id = account subdomain, secret = API access token, config.member_id = comment author.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgRole } from './org-access'
import { openSecret } from './secret-box'
import type { GhCreds } from './greenhouse'
import type { WkCreds } from './workable'

export type Provider = 'greenhouse' | 'workable'
export const PROVIDERS: Provider[] = ['greenhouse', 'workable']
export const PROVIDER_LABEL: Record<Provider, string> = { greenhouse: 'Greenhouse', workable: 'Workable' }
export const isProvider = (v: unknown): v is Provider => v === 'greenhouse' || v === 'workable'

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

export type GreenhouseConnection = Connection & { creds: GhCreds }
export type WorkableConnection = Connection & { creds: WkCreds }

export const BUSINESS_APP_URL = 'https://business.modulehire.com'

export const clientIdHint = (id: string) => (id.length > 6 ? `…${id.slice(-4)}` : '…')
const hintFor = (provider: Provider, clientId: string) => (provider === 'workable' ? `${clientId}.workable.com` : `client ${clientIdHint(clientId)}`)

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
    lastError = `The saved key can no longer be read. Reconnect ${PROVIDER_LABEL[provider]}.`
  }
  return {
    provider,
    clientId,
    secret,
    writebackEnabled: !!data.writeback_enabled,
    config: (data.config as Record<string, unknown> | null) ?? {},
    hint: hintFor(provider, clientId),
    status,
    lastError,
  }
}

export async function loadGreenhouse(admin: SupabaseClient, orgId: string): Promise<GreenhouseConnection | null> {
  const c = await loadIntegration(admin, orgId, 'greenhouse')
  return c ? { ...c, creds: { clientId: c.clientId, clientSecret: c.secret } } : null
}

export async function loadWorkable(admin: SupabaseClient, orgId: string): Promise<WorkableConnection | null> {
  const c = await loadIntegration(admin, orgId, 'workable')
  return c ? { ...c, creds: { subdomain: c.clientId, token: c.secret } } : null
}

export async function markIntegrationError(admin: SupabaseClient, orgId: string, provider: Provider, message: string | null) {
  await admin
    .from('org_integrations')
    .update({ status: message ? 'error' : 'connected', last_error: message, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('provider', provider)
}

export const markGreenhouseError = (admin: SupabaseClient, orgId: string, message: string | null) =>
  markIntegrationError(admin, orgId, 'greenhouse', message)

export function scoreNote(input: { score: number | null; dealbreaker: boolean; headline: string | null; jobId: string; jobTitle: string }) {
  return [
    `ModuleHire score: ${input.score ?? 'not scored'}/100 for ${input.jobTitle}`,
    input.dealbreaker ? 'Misses at least one dealbreaker requirement.' : null,
    input.headline ? `Summary: ${input.headline}` : null,
    `Evidence for each requirement: ${BUSINESS_APP_URL}/business/jobs/${input.jobId}`,
    'Scored by AI from the resume. Use it as one input; a person makes the decision.',
  ].filter(Boolean).join('\n')
}
