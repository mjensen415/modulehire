import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateExternalUrl } from '@/lib/url-validation'
import { checkAndLog } from '@/lib/rate-limit'

export const maxDuration = 30

const MAX_HTML_BYTES = 2_000_000 // 2 MB ceiling on fetched content

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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

  let html: string
  try {
    const res = await fetch(check.url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ModuleHire/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
      redirect: 'manual', // don't follow redirects (would re-open SSRF)
    })
    if (res.status >= 300 && res.status < 400) {
      return NextResponse.json({ error: 'URL redirected — please paste the final URL directly.' }, { status: 422 })
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return NextResponse.json({ error: 'URL did not return an HTML page.' }, { status: 422 })
    }

    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_HTML_BYTES) {
      return NextResponse.json({ error: 'Page too large.' }, { status: 422 })
    }
    html = new TextDecoder().decode(buf)
  } catch {
    return NextResponse.json({ error: 'Could not fetch URL.' }, { status: 422 })
  }

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
