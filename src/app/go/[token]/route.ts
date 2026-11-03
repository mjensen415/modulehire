// One-click editor links from the MCP server's get_editor_link tool. The token is random, single
// use, and expires 5 minutes after it was made; only its sha256 is stored (mcp_link_tokens).
//
// The admin client is used to look the token up and mark it used: the browser opening the link
// may have no session yet, and users can't update their own rows (see the migration).
//
// Signing a signed-out browser in: we generate a magic link for the token's user and verify its
// hashed token right here, which sets the session cookies on this response. Redirecting to the
// magic link itself would land the session tokens in the URL fragment, so we never do that.
import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ token: string }> }

function redirectTo(req: Request, path: string) {
  const res = NextResponse.redirect(new URL(path, req.url))
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}

export async function GET(req: Request, { params }: RouteContext) {
  const { token } = await params
  // Expired, used, or unknown links go to sign-in (back to the resume when we know which one).
  const toSignin = (resumeId?: string) =>
    redirectTo(req, resumeId ? `/signin?next=${encodeURIComponent(`/resumes/${resumeId}`)}` : '/signin')

  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return toSignin()

  try {
    const admin = await createAdminClient()
    const hash = createHash('sha256').update(token).digest('hex')
    const { data: link } = await admin
      .from('mcp_link_tokens')
      .select('id, user_id, resume_id, expires_at, used_at')
      .eq('token_hash', hash)
      .maybeSingle()
    if (!link) return toSignin()
    const destination = `/resumes/${link.resume_id}`
    if (link.used_at || Date.parse(link.expires_at) <= Date.now()) return toSignin(link.resume_id)

    // Mark it used before anything else; the `used_at is null` filter makes this the one claim.
    const { data: claimed } = await admin
      .from('mcp_link_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', link.id)
      .is('used_at', null)
      .select('id')
      .maybeSingle()
    if (!claimed) return toSignin(link.resume_id)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.id === link.user_id) return redirectTo(req, destination)
    if (user) return redirectTo(req, `/go/switch-account?resume=${link.resume_id}`)

    const { data: target } = await admin.auth.admin.getUserById(link.user_id)
    const email = target.user?.email
    // Verifying a magic link confirms the email address, so an account that hasn't confirmed
    // its email signs in the normal way instead.
    if (!email || !target.user?.email_confirmed_at) return toSignin(link.resume_id)

    const { data: generated, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const hashedToken = generated?.properties?.hashed_token
    if (linkError || !hashedToken) {
      console.error('[go] generateLink failed:', linkError?.message)
      return toSignin(link.resume_id)
    }
    const { error: verifyError } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: hashedToken })
    if (verifyError) {
      console.error('[go] verifyOtp failed:', verifyError.message)
      return toSignin(link.resume_id)
    }
    return redirectTo(req, destination)
  } catch (error) {
    console.error('[go]', error)
    return toSignin()
  }
}
