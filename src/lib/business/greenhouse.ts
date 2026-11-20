// Greenhouse Harvest v3 client for ModuleHire for Business (server only).
// Auth: OAuth 2.0 client credentials the customer creates in Greenhouse (Dev Center, API
// Credentials, "Harvest V3 (OAuth)"), no `sub`, so calls run as their integration user.
// Docs: https://harvestdocs.greenhouse.io (authentication, pagination, rate limiting).
// Cursor pagination: follow the Link rel="next" URL exactly; a cursor URL takes no other params.
import { safeFetchBuffer } from '@/lib/url-validation'
import { AtsError } from './ats/http'

const AUTH_URL = 'https://auth.greenhouse.io/token'
const API = 'https://harvest.greenhouse.io'

/** Scopes the credential needs. The last one is only for posting scores back as notes. */
export const GREENHOUSE_SCOPES = [
  'harvest:jobs:list',
  'harvest:job_posts:list',
  'harvest:applications:list',
  'harvest:candidates:list',
  'harvest:attachments:list',
  'harvest:ai_opt_out_statuses:list',
  'harvest:notes:create',
] as const

export type GhCreds = { clientId: string; clientSecret: string }

export class GreenhouseError extends AtsError {}

const tokens = new Map<string, { token: string; exp: number; secret: string }>()

async function token(creds: GhCreds, force = false): Promise<string> {
  const cached = tokens.get(creds.clientId)
  if (!force && cached && cached.secret === creds.clientSecret && cached.exp > Date.now() + 30_000) return cached.token
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 401 || res.status === 400 || res.status === 403) {
    throw new GreenhouseError('Greenhouse rejected these credentials. Check the client ID and secret.', res.status, 'auth')
  }
  if (!res.ok) throw new GreenhouseError(`Greenhouse sign-in failed (${res.status}).`, res.status)
  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) throw new GreenhouseError('Greenhouse did not return an access token.', 502)
  tokens.set(creds.clientId, { token: data.access_token, exp: Date.now() + (data.expires_in ?? 300) * 1000, secret: creds.clientSecret })
  return data.access_token
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function ghRequest(creds: GhCreds, url: string, init: RequestInit = {}): Promise<Response> {
  let forced = false
  for (let attempt = 0; attempt < 4; attempt++) {
    const t = await token(creds, forced)
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(25_000),
    })
    if (res.status === 401 && !forced) { forced = true; continue }
    if (res.status === 429) {
      // Fixed 30-second windows; wait what Greenhouse asks, but never hang a request for long.
      const wait = Math.min(12, Number(res.headers.get('retry-after') ?? '2') || 2)
      await sleep(wait * 1000)
      continue
    }
    if (res.status === 401) throw new GreenhouseError('Greenhouse rejected these credentials. Reconnect Greenhouse in Settings.', 401, 'auth')
    if (res.status === 403) {
      throw new GreenhouseError('This Greenhouse credential is missing a permission ModuleHire needs. Check its scopes in Greenhouse.', 403, 'scope')
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new GreenhouseError(`Greenhouse request failed (${res.status}). ${detail.slice(0, 200)}`.trim(), res.status)
    }
    return res
  }
  throw new GreenhouseError('Greenhouse is rate limiting requests. Try again in a minute.', 429, 'rate')
}

function nextLink(link: string | null): string | null {
  if (!link) return null
  for (const part of link.split(',')) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/)
    if (m) return m[1]
  }
  return null
}

/** GET a list endpoint and follow its cursor pages (each cursor URL only on harvest.greenhouse.io). */
async function ghList<T>(creds: GhCreds, path: string, params: Record<string, string | number | boolean>, maxPages = 10): Promise<T[]> {
  // Id lists are documented as comma separated; keep the commas literal.
  const q = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v)).replace(/%2C/gi, ',')}`).join('&')
  let url: string | null = `${API}${path}?${q}`
  const out: T[] = []
  for (let page = 0; url && page < maxPages; page++) {
    const res = await ghRequest(creds, url)
    const body = (await res.json()) as T[]
    if (Array.isArray(body)) out.push(...body)
    const next = nextLink(res.headers.get('link'))
    url = next && new URL(next).hostname === 'harvest.greenhouse.io' ? next : null
  }
  return out
}

const chunks = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

export type GhJob = { id: number; name: string; requisition_id: string | null; opened_at: string | null }

/** A quick call that proves the credential works and can read jobs. */
export async function verifyCredentials(creds: GhCreds): Promise<void> {
  await ghList<GhJob>(creds, '/v3/jobs', { per_page: 1 }, 1)
}

export async function listOpenJobs(creds: GhCreds): Promise<GhJob[]> {
  const jobs = await ghList<GhJob>(creds, '/v3/jobs', { status: 'open', per_page: 500 }, 4)
  return jobs.map((j) => ({ id: j.id, name: j.name, requisition_id: j.requisition_id ?? null, opened_at: j.opened_at ?? null }))
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

/** The job's posting text (the external, live post if there is one), as plain text. */
export async function jobPostText(creds: GhCreds, jobId: number): Promise<{ title: string; text: string } | null> {
  type Post = { id: number; title: string; content: string | null; live: boolean; internal: boolean }
  const posts = await ghList<Post>(creds, '/v3/job_posts', { job_ids: jobId, per_page: 50 }, 1)
  const best = posts.find((p) => p.live && !p.internal) ?? posts.find((p) => !p.internal) ?? posts[0]
  if (!best?.content) return null
  return { title: best.title, text: htmlToText(best.content) }
}

export type GhApplication = { id: number; candidate_id: number; job_id: number | null; stage_name: string | null; status: string; created_at: string }
type GhCandidate = { id: number; first_name: string | null; last_name: string | null; preferred_name: string | null; email_addresses: Array<{ value: string; type?: string }> }
export type GhAttachment = { id: number; application_id: number; candidate_id: number | null; type: string; filename: string; url: string; created_at: string }

export type GhApplicant = {
  application_id: number
  candidate_id: number
  name: string | null
  email: string | null
  stage: string | null
  applied_at: string
  resume: { filename: string } | null
  opted_out: boolean
}

/** Latest resume per application. */
export async function resumesFor(creds: GhCreds, applicationIds: number[]): Promise<Map<number, GhAttachment>> {
  const best = new Map<number, GhAttachment>()
  for (const ids of chunks(applicationIds, 50)) {
    const list = await ghList<GhAttachment>(creds, '/v3/attachments', { application_ids: ids.join(','), type: 'resume', per_page: 500 }, 2)
    for (const a of list) {
      const cur = best.get(a.application_id)
      if (!cur || a.created_at > cur.created_at) best.set(a.application_id, a)
    }
  }
  return best
}

/**
 * Candidates who opted out of AI-assisted review for this job (Greenhouse records it per job).
 * We never import or score them. Fails closed: if the list can't be read, the import stops.
 */
export async function optedOutCandidates(creds: GhCreds, jobId: number): Promise<Set<number>> {
  type OptOut = { candidate_ids: number[]; opted_out: boolean; job_id: number }
  const list = await ghList<OptOut>(creds, '/v3/ai_opt_out_statuses', { job_ids: jobId, opted_out: true, per_page: 500 }, 4)
  return new Set(list.filter((o) => o.opted_out).flatMap((o) => o.candidate_ids ?? []))
}

/** In-process (not rejected or hired) applications on a job, with names, emails and resumes. */
export async function listJobApplicants(creds: GhCreds, jobId: number, limit = 1000): Promise<GhApplicant[]> {
  const apps = (await ghList<GhApplication>(creds, '/v3/applications', { job_ids: jobId, status: 'in_process', prospect: false, per_page: 500 }, Math.ceil(limit / 500)))
    .slice(0, limit)
  if (!apps.length) return []
  const [optedOut, resumes] = await Promise.all([optedOutCandidates(creds, jobId), resumesFor(creds, apps.map((a) => a.id))])
  const people = new Map<number, GhCandidate>()
  for (const ids of chunks([...new Set(apps.map((a) => a.candidate_id))], 50)) {
    const list = await ghList<GhCandidate>(creds, '/v3/candidates', { ids: ids.join(','), per_page: 50 }, 1)
    for (const c of list) people.set(c.id, c)
  }
  return apps.map((a) => {
    const c = people.get(a.candidate_id)
    const first = c?.preferred_name || c?.first_name || ''
    const name = [first, c?.last_name ?? ''].join(' ').trim() || null
    const email = c?.email_addresses?.find((e) => e.type === 'personal')?.value ?? c?.email_addresses?.[0]?.value ?? null
    const r = resumes.get(a.id)
    return {
      application_id: a.id,
      candidate_id: a.candidate_id,
      name,
      email,
      stage: a.stage_name ?? null,
      applied_at: a.created_at,
      resume: r ? { filename: r.filename } : null,
      opted_out: optedOut.has(a.candidate_id),
    }
  })
}

/** One application, re-read at import time so the opt-out and resume link are current. */
export async function getApplication(creds: GhCreds, applicationId: number): Promise<GhApplication | null> {
  const list = await ghList<GhApplication>(creds, '/v3/applications', { ids: applicationId, per_page: 1 }, 1)
  return list[0] ?? null
}

export async function getCandidate(creds: GhCreds, candidateId: number): Promise<{ name: string | null; email: string | null }> {
  const list = await ghList<GhCandidate>(creds, '/v3/candidates', { ids: candidateId, per_page: 1 }, 1)
  const c = list[0]
  if (!c) return { name: null, email: null }
  const first = c.preferred_name || c.first_name || ''
  return {
    name: [first, c.last_name ?? ''].join(' ').trim() || null,
    email: c.email_addresses?.find((e) => e.type === 'personal')?.value ?? c.email_addresses?.[0]?.value ?? null,
  }
}

const MAX_RESUME = 10 * 1024 * 1024

/**
 * Downloads an attachment from its signed, time-limited URL. Greenhouse may serve it through a
 * redirect endpoint; the bearer token is only ever sent to *.greenhouse.io, never to the file host.
 */
export async function downloadAttachment(creds: GhCreds, att: GhAttachment): Promise<Buffer> {
  let url: URL
  try { url = new URL(att.url) } catch { throw new GreenhouseError('Greenhouse returned an unreadable resume link.', 502) }
  if (url.protocol !== 'https:') throw new GreenhouseError('Greenhouse returned an insecure resume link.', 502)

  const plain = await safeFetchBuffer(url, { maxBytes: MAX_RESUME, timeoutMs: 30_000, maxRedirects: 4 })
  if (plain.ok) return plain.body
  if (plain.reason === 'too_large') throw new GreenhouseError('This resume is over 10 MB.', 413)

  const isGh = url.hostname === 'greenhouse.io' || url.hostname.endsWith('.greenhouse.io')
  if (isGh && plain.reason === 'http_error' && (plain.status === 401 || plain.status === 403)) {
    const first = await safeFetchBuffer(url, {
      maxBytes: MAX_RESUME, timeoutMs: 30_000, maxRedirects: 0,
      headers: { Authorization: `Bearer ${await token(creds)}` },
    })
    if (first.ok) return first.body
  }
  throw new GreenhouseError('Could not download this resume from Greenhouse.', 502)
}

export async function resumeForApplication(creds: GhCreds, applicationId: number): Promise<GhAttachment | null> {
  return (await resumesFor(creds, [applicationId])).get(applicationId) ?? null
}

export async function postScoreNote(
  creds: GhCreds,
  input: { candidateId: number; applicationId: number; body: string },
): Promise<void> {
  await ghRequest(creds, `${API}/v3/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      candidate_id: input.candidateId,
      application_id: input.applicationId,
      note_type: 'NOTE',
      visibility: 'public',
      body: input.body,
    }),
  })
}
