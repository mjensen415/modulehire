import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/supabase/resolve-auth'
import { safeFetchText, validateExternalUrl } from '@/lib/url-validation'
import { checkAndLog } from '@/lib/rate-limit'

export const maxDuration = 30

const MAX_HTML_BYTES = 2_000_000 // 2 MB ceiling on fetched content

export async function POST(req: Request) {
  const { user, supabase } = await resolveAuth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = await checkAndLog(supabase, user.id, 'rl_fetch_jd_url', 30, 3600)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
  }

  const { url }: { url: string } = await req.json()

  const check = await validateExternalUrl(url)
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 400 })
  }

  if (check.url.hostname.endsWith('linkedin.com')) {
    return NextResponse.json(
      { error: 'LinkedIn blocks automated access. Please copy and paste the job description text directly.' },
      { status: 422 }
    )
  }

  // safeFetchText re-checks the address it actually connects to (DNS rebinding), follows
  // up to 3 redirects with each hop re-validated, and stops reading past the size cap.
  const fetched = await safeFetchText(check.url, {
    maxBytes: MAX_HTML_BYTES,
    timeoutMs: 15000,
    maxRedirects: 3,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ModuleHire/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
  })
  if (!fetched.ok) {
    const error =
      fetched.reason === 'blocked' ? 'That URL points somewhere we can\'t fetch from.'
      : fetched.reason === 'too_large' ? 'Page too large.'
      : fetched.reason === 'too_many_redirects' ? 'URL redirected too many times. Please paste the final URL directly.'
      : 'Could not fetch URL.'
    return NextResponse.json({ error }, { status: fetched.reason === 'blocked' ? 400 : 422 })
  }
  if (fetched.finalUrl.hostname.endsWith('linkedin.com')) {
    return NextResponse.json(
      { error: 'LinkedIn blocks automated access. Please copy and paste the job description text directly.' },
      { status: 422 }
    )
  }
  if (!fetched.contentType.includes('text/html') && !fetched.contentType.includes('application/xhtml')) {
    return NextResponse.json({ error: 'URL did not return an HTML page.' }, { status: 422 })
  }
  const html = fetched.body

  // Strip tags, collapse whitespace
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (text.length < 100) {
    return NextResponse.json({ error: 'Could not extract readable text from this page.' }, { status: 422 })
  }

  return NextResponse.json({ text: text.slice(0, 12000) })
}
