// Workable SPI v3 client for ModuleHire for Business (server only).
// Auth: an API access token the customer generates in their own Workable account (Settings,
// Integrations, API Access Tokens) with scopes r_jobs, r_candidates and, for score comments,
// w_candidates (or w_comments). Base URL https://{subdomain}.workable.com/spi/v3.
// Docs: https://workable.readme.io. Paging: follow paging.next. Account tokens are limited to
// 10 requests per 10 seconds, so 429s are expected and retried after the reset.
import { safeFetchBuffer } from '@/lib/url-validation'
import { AtsError } from './ats/http'

export const WORKABLE_SCOPES = ['r_jobs', 'r_candidates', 'w_candidates'] as const

export type WkCreds = { subdomain: string; token: string }

export class WorkableError extends AtsError {}

export const isWorkableSubdomain = (s: string) => /^[a-z0-9][a-z0-9-]{0,62}$/.test(s)

/** Accepts "acme", "acme.workable.com" or "https://acme.workable.com/...". */
export function normalizeSubdomain(input: string): string | null {
  let s = input.trim().toLowerCase()
  s = s.replace(/^https?:\/\//, '').split('/')[0]
  s = s.replace(/\.workable\.com$/, '')
  return isWorkableSubdomain(s) ? s : null
}

const base = (c: WkCreds) => `https://${c.subdomain}.workable.com/spi/v3`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Only ever send the token to this account's API host or Workable's own www API host. */
function isWorkableApiUrl(url: string, c: WkCreds): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    if (u.hostname === `${c.subdomain}.workable.com`) return u.pathname.startsWith('/spi/v3/')
    // Paging links may point at www.workable.com, scoped to this account.
    return u.hostname === 'www.workable.com' && u.pathname.startsWith(`/spi/v3/accounts/${c.subdomain}/`)
  } catch {
    return false
  }
}

async function wkRequest(c: WkCreds, url: string, init: RequestInit = {}): Promise<Response> {
  if (!isWorkableApiUrl(url, c)) throw new WorkableError('Unexpected Workable URL.', 502)
  for (let attempt = 0; attempt < 4; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        ...init,
        headers: { ...(init.headers ?? {}), Authorization: `Bearer ${c.token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(25_000),
      })
    } catch {
      throw new WorkableError(`Could not reach ${c.subdomain}.workable.com. Check the subdomain.`, 502)
    }
    if (res.status === 429) {
      const reset = Number(res.headers.get('x-rate-limit-reset'))
      const waitMs = Number.isFinite(reset) && reset > 0
        ? Math.min(11_000, Math.max(500, (reset > 1e12 ? reset : reset * 1000) - Date.now() + 250))
        : 3000
      await sleep(waitMs)
      continue
    }
    if (res.status === 401) throw new WorkableError('Workable rejected this token. Check it, or generate a new one.', 401, 'auth')
    if (res.status === 403) throw new WorkableError('This Workable token is missing a scope ModuleHire needs. Check its scopes in Workable.', 403, 'scope')
    if (res.status === 404 && attempt === 0 && url.endsWith('/jobs?limit=1')) {
      throw new WorkableError(`No Workable account at ${c.subdomain}.workable.com. Check the subdomain.`, 404, 'auth')
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new WorkableError(`Workable request failed (${res.status}). ${detail.slice(0, 200)}`.trim(), res.status)
    }
    return res
  }
  throw new WorkableError('Workable is rate limiting requests. Try again in a minute.', 429, 'rate')
}

async function wkList<T>(c: WkCreds, path: string, key: string, params: Record<string, string | number>, maxPages = 10): Promise<T[]> {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
  let url: string | null = `${base(c)}${path}?${q.toString()}`
  const out: T[] = []
  for (let page = 0; url && page < maxPages; page++) {
    const res = await wkRequest(c, url)
    const body = (await res.json()) as Record<string, unknown>
    const items = body[key]
    if (Array.isArray(items)) out.push(...(items as T[]))
    const next = (body.paging as { next?: string } | undefined)?.next
    url = next && isWorkableApiUrl(next, c) ? next : null
  }
  return out
}

export type WkJob = { id: string; title: string; full_title?: string; shortcode: string; state: string; code?: string | null }

export async function verifyWorkable(c: WkCreds): Promise<void> {
  await wkRequest(c, `${base(c)}/jobs?limit=1`)
}

/** Published and internal ("closed") jobs: the ones still hiring. */
export async function listOpenWorkableJobs(c: WkCreds): Promise<Array<{ id: string; name: string; requisition_id: string | null }>> {
  const [published, internal] = await Promise.all([
    wkList<WkJob>(c, '/jobs', 'jobs', { state: 'published', limit: 100 }, 5),
    wkList<WkJob>(c, '/jobs', 'jobs', { state: 'closed', limit: 100 }, 5),
  ])
  return [...published, ...internal].map((j) => ({ id: j.shortcode, name: j.title, requisition_id: j.code || null }))
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

const SHORTCODE = /^[A-Za-z0-9]{2,40}$/
export const isShortcode = (s: unknown): s is string => typeof s === 'string' && SHORTCODE.test(s)

export async function workableJobText(c: WkCreds, shortcode: string): Promise<{ title: string; text: string } | null> {
  const res = await wkRequest(c, `${base(c)}/jobs/${encodeURIComponent(shortcode)}`)
  const j = (await res.json()) as { title?: string; full_description?: string; description?: string; requirements?: string; benefits?: string }
  const html = j.full_description || [j.description, j.requirements, j.benefits].filter(Boolean).join('\n')
  if (!html) return null
  return { title: j.title ?? '', text: htmlToText(html) }
}

type WkCandidateRow = {
  id: string
  name: string | null
  firstname?: string | null
  lastname?: string | null
  email: string | null
  stage: string | null
  stage_kind?: string | null
  disqualified: boolean
  hired_at?: string | null
  created_at: string
  job?: { shortcode?: string }
  resume_metadata?: { filename?: string } | null
}

export type WkApplicant = {
  candidate_id: string
  name: string | null
  email: string | null
  stage: string | null
  applied_at: string
  resume: { filename: string } | null
}

const isActive = (c: WkCandidateRow) => !c.disqualified && !c.hired_at && (c.stage_kind ?? '').toLowerCase() !== 'hired'

/** Active (not disqualified, not hired) candidates on a job. */
export async function listWorkableApplicants(c: WkCreds, shortcode: string, limit = 1000): Promise<WkApplicant[]> {
  const rows = await wkList<WkCandidateRow>(c, '/candidates', 'candidates', { shortcode, limit: 100 }, Math.ceil(limit / 100))
  return rows.filter(isActive).slice(0, limit).map((r) => ({
    candidate_id: r.id,
    name: r.name || [r.firstname, r.lastname].filter(Boolean).join(' ') || null,
    email: r.email ?? null,
    stage: r.stage ?? null,
    applied_at: r.created_at,
    // The list may not include resume details; "unknown" (null metadata) still gets tried at import.
    resume: r.resume_metadata?.filename ? { filename: r.resume_metadata.filename } : null,
  }))
}

export type WkCandidate = WkCandidateRow & { resume_url?: string | null }

export async function getWorkableCandidate(c: WkCreds, id: string): Promise<WkCandidate> {
  if (!/^[A-Za-z0-9]{2,40}$/.test(id)) throw new WorkableError('Invalid candidate id.', 400)
  const res = await wkRequest(c, `${base(c)}/candidates/${encodeURIComponent(id)}`)
  const body = (await res.json()) as { candidate?: WkCandidate } & WkCandidate
  return body.candidate ?? body
}

export const workableCandidateIsActive = (cand: WkCandidate) => isActive(cand)

const MAX_RESUME = 10 * 1024 * 1024

/** Downloads a resume from the candidate's (signed) resume_url. No token is sent to the file host. */
export async function downloadWorkableResume(cand: WkCandidate): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  if (!cand.resume_url) throw new WorkableError('No resume in Workable', 404)
  let url: URL
  try { url = new URL(cand.resume_url) } catch { throw new WorkableError('Workable returned an unreadable resume link.', 502) }
  if (url.protocol !== 'https:') throw new WorkableError('Workable returned an insecure resume link.', 502)
  const res = await safeFetchBuffer(url, { maxBytes: MAX_RESUME, timeoutMs: 30_000, maxRedirects: 4 })
  if (!res.ok) {
    if (res.reason === 'too_large') throw new WorkableError('This resume is over 10 MB.', 413)
    throw new WorkableError('Could not download this resume from Workable.', 502)
  }
  const fromMeta = cand.resume_metadata?.filename
  const fromUrl = decodeURIComponent(res.finalUrl.pathname.split('/').pop() ?? '')
  const ct = res.contentType.toLowerCase()
  const guessed = ct.includes('pdf') ? 'resume.pdf' : ct.includes('wordprocessingml') ? 'resume.docx' : ct.startsWith('text/plain') ? 'resume.txt' : ''
  const filename = [fromMeta, fromUrl, guessed].find((n) => n && /\.(pdf|docx|txt)$/i.test(n)) ?? fromMeta ?? fromUrl ?? 'resume'
  return { buffer: res.body, filename, contentType: res.contentType }
}

/** The member score comments are posted as: the connecting user's own member, else an active admin. */
export async function findCommentMember(c: WkCreds, email: string | null): Promise<string | null> {
  type Member = { id: string; email?: string; role?: string; roles?: string[]; active?: boolean }
  if (email) {
    const mine = await wkList<Member>(c, '/members', 'members', { email, limit: 10 }, 1).catch(() => [])
    const me = mine.find((m) => m.active !== false && m.email?.toLowerCase() === email.toLowerCase())
    if (me) return me.id
  }
  const all = await wkList<Member>(c, '/members', 'members', { limit: 100 }, 2).catch(() => [])
  const admin = all.find((m) => m.active !== false && (m.role === 'admin' || (m.roles ?? []).some((r) => r === 'ats.admin' || r === 'workable.superadmin')))
  return admin?.id ?? null
}

export async function postWorkableComment(c: WkCreds, input: { candidateId: string; memberId: string; body: string }): Promise<void> {
  await wkRequest(c, `${base(c)}/candidates/${encodeURIComponent(input.candidateId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      member_id: input.memberId,
      // Hiring team only, not external agency recruiters.
      comment: { body: input.body, policy: ['hiring_manager', 'recruiting_admin', 'admin'] },
    }),
  })
}
