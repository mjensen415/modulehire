// Shared HTTP plumbing for ATS connectors (server only): one error type, Basic auth, and a
// fetch that only talks to the provider's own API host and waits out rate limits.
import { safeFetchBuffer } from '@/lib/url-validation'

export class AtsError extends Error {
  constructor(message: string, readonly status: number, readonly kind: 'auth' | 'scope' | 'rate' | 'other' = 'other') {
    super(message)
  }
}

export const basicAuth = (user: string, pass = '') => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type AtsFetchOptions = RequestInit & {
  label: string // provider name for messages
  auth: string // Authorization header value
  allowed: (url: URL) => boolean // the token is only ever sent where this says
  json?: unknown
}

/** One API call with retries on 429/503 (Retry-After or a short backoff), and mapped errors. */
export async function atsFetch(url: string, opts: AtsFetchOptions): Promise<Response> {
  let u: URL
  try { u = new URL(url) } catch { throw new AtsError(`Unexpected ${opts.label} URL.`, 502) }
  if (u.protocol !== 'https:' || !opts.allowed(u)) throw new AtsError(`Unexpected ${opts.label} URL.`, 502)
  const { label, auth, allowed: _allowed, json, headers, ...init } = opts
  for (let attempt = 0; attempt < 4; attempt++) {
    let res: Response
    try {
      res = await fetch(u, {
        ...init,
        body: json !== undefined ? JSON.stringify(json) : init.body,
        headers: {
          Accept: 'application/json',
          ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(headers as Record<string, string> | undefined),
          Authorization: auth,
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(25_000),
      })
    } catch {
      throw new AtsError(`Could not reach ${label}. Check the account details.`, 502)
    }
    if (res.status === 429 || res.status === 503) {
      const ra = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(10_000, ra * 1000) : 1000 * 2 ** attempt)
      continue
    }
    if (res.status === 401) throw new AtsError(`${label} rejected this key. Check it, or create a new one.`, 401, 'auth')
    if (res.status === 403) throw new AtsError(`This ${label} key is missing a permission ModuleHire needs. Check its permissions in ${label}.`, 403, 'scope')
    if (res.status >= 300 && res.status < 400) return res // caller decides (file downloads)
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new AtsError(`${label} request failed (${res.status}). ${detail.slice(0, 200)}`.trim(), res.status)
    }
    return res
  }
  throw new AtsError(`${label} is rate limiting requests. Try again in a minute.`, 429, 'rate')
}

export const MAX_RESUME_BYTES = 10 * 1024 * 1024

/**
 * Downloads a file from the provider's API (with auth, only to an allowed host). If the API
 * redirects to file storage, the redirect is followed with no credentials, through the SSRF guard.
 */
export async function downloadWithAuth(url: string, opts: { label: string; auth: string; allowed: (u: URL) => boolean }) {
  const res = await atsFetch(url, { ...opts, headers: { Accept: '*/*' } })
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location')
    if (!loc) throw new AtsError(`Could not download this resume from ${opts.label}.`, 502)
    return downloadPublic(new URL(loc, url).toString(), opts.label)
  }
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > MAX_RESUME_BYTES) throw new AtsError('This resume is over 10 MB.', 413)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_RESUME_BYTES) throw new AtsError('This resume is over 10 MB.', 413)
  return { buffer: buf, contentType: res.headers.get('content-type') ?? '', disposition: res.headers.get('content-disposition') ?? '', finalUrl: new URL(url) }
}

/** A signed, public file link: no credentials, SSRF-guarded, 10 MB cap. */
export async function downloadPublic(url: string, label: string) {
  let u: URL
  try { u = new URL(url) } catch { throw new AtsError(`${label} returned an unreadable file link.`, 502) }
  if (u.protocol !== 'https:') throw new AtsError(`${label} returned an insecure file link.`, 502)
  const res = await safeFetchBuffer(u, { maxBytes: MAX_RESUME_BYTES, timeoutMs: 30_000, maxRedirects: 4 })
  if (!res.ok) {
    if (res.reason === 'too_large') throw new AtsError('This resume is over 10 MB.', 413)
    throw new AtsError(`Could not download this resume from ${label}.`, 502)
  }
  return { buffer: res.body, contentType: res.contentType, disposition: '', finalUrl: res.finalUrl }
}

/** Picks a usable resume file name from metadata, Content-Disposition, the URL, or the type. */
export function resumeFilename(candidates: Array<string | null | undefined>, contentType: string, disposition = '', finalUrl?: URL): string {
  const fromDisp = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1]
  const fromUrl = finalUrl ? decodeURIComponent(finalUrl.pathname.split('/').pop() ?? '') : ''
  const ct = contentType.toLowerCase()
  const byType = ct.includes('pdf') ? 'resume.pdf' : ct.includes('wordprocessingml') ? 'resume.docx' : ct.startsWith('text/plain') ? 'resume.txt' : ''
  const all = [...candidates, fromDisp ? decodeURIComponent(fromDisp) : null, fromUrl, byType].filter((n): n is string => !!n)
  return all.find((n) => /\.(pdf|docx|txt)$/i.test(n)) ?? all[0] ?? 'resume'
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}
