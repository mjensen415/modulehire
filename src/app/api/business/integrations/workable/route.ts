import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { checkAndLog } from '@/lib/rate-limit'
import { sealSecret } from '@/lib/business/secret-box'
import { WorkableError, findCommentMember, normalizeSubdomain, verifyWorkable } from '@/lib/business/workable'
import { canManageIntegrations } from '@/lib/business/integrations'

// POST { org_id, subdomain, token, writeback_enabled? } — owners/admins. Checks the token
// against the account before saving it, encrypted, and finds the Workable member that score
// comments will be posted as (the connecting user's own member, else an admin).
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const orgId = body.org_id
  if (!isUuid(orgId)) return NextResponse.json({ error: 'Invalid org_id' }, { status: 400 })
  if (!(await canManageIntegrations(supabase, orgId, user.id))) {
    return NextResponse.json({ error: 'Only an owner or admin can connect Workable.' }, { status: 403 })
  }
  const limit = await checkAndLog(supabase, user.id, 'rl_biz_ats_connect', 10, 3600)
  if (!limit.ok) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })

  const subdomain = typeof body.subdomain === 'string' ? normalizeSubdomain(body.subdomain) : null
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!subdomain) return NextResponse.json({ error: 'Enter your Workable subdomain (the "acme" in acme.workable.com).' }, { status: 400 })
  if (token.length < 16 || token.length > 500 || /\s/.test(token)) {
    return NextResponse.json({ error: 'Paste the API access token from Workable.' }, { status: 400 })
  }
  const creds = { subdomain, token }
  try {
    await verifyWorkable(creds)
  } catch (e) {
    return NextResponse.json({ error: e instanceof WorkableError ? e.message : 'Could not reach Workable. Try again.' }, { status: 400 })
  }
  const memberId = await findCommentMember(creds, user.email ?? null).catch(() => null)

  const admin = await createAdminClient()
  const { error } = await admin.from('org_integrations').upsert(
    {
      org_id: orgId, provider: 'workable', client_id: subdomain, secret_ciphertext: sealSecret(token),
      writeback_enabled: body.writeback_enabled !== false, status: 'connected', last_error: null,
      config: memberId ? { member_id: memberId } : {}, connected_by: user.id, updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,provider' },
  )
  if (error) {
    console.error('[integrations/workable POST]', error)
    return NextResponse.json({ error: 'Could not save the connection.' }, { status: 500 })
  }
  await admin.from('usage_events').insert({ user_id: user.id, action: 'ev_biz_ats_connect', metadata: { org_id: orgId, provider: 'workable' } })
  return NextResponse.json({ connected: true, hint: `${subdomain}.workable.com`, can_comment: !!memberId })
}
