'use server'

import { createClient } from '@/lib/supabase/server'

export type ConsentDecision = { url: string } | { error: string }

const EXPIRED = 'This request has expired. Go back to the app and connect ModuleHire again.'

// Approve or deny an OAuth authorization request for the signed-in user. Returns the URL to send
// the browser to (the client's callback with a code, or with access_denied) instead of
// redirecting: our CSP's form-action 'self' would block a form POST that redirects off-site.
export async function decideAuthorization(authorizationId: string, approve: boolean): Promise<ConsentDecision> {
  if (typeof authorizationId !== 'string' || !authorizationId || authorizationId.length > 200) {
    return { error: EXPIRED }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session ended. Sign in again, then reconnect from the app.' }

  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
  if (error || !data?.redirect_url) return { error: EXPIRED }

  // Supabase only redirects to the client's registered URIs; this just keeps anything that
  // isn't a web URL out of window.location.
  try {
    const { protocol } = new URL(data.redirect_url)
    if (protocol !== 'https:' && protocol !== 'http:') return { error: EXPIRED }
  } catch {
    return { error: EXPIRED }
  }
  return { url: data.redirect_url }
}
