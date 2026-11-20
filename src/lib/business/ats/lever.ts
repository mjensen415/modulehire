// Lever API (v1) connector. Auth: an API key the customer creates in Lever (Settings, Integrations
// and API, API Credentials), sent as the Basic auth username with a blank password.
// Docs: https://hire.lever.co/developer/documentation. Paging: `next` offset token + `hasNext`.
// Rate limit: about 10 requests a second per key (bursts to 20); 429s are retried.
import { AtsError, atsFetch, basicAuth, downloadWithAuth, htmlToText, resumeFilename } from './http'
import type { Adapter, AtsApplicant } from './types'

const API = 'https://api.lever.co/v1'
const LABEL = 'Lever'
const allowed = (u: URL) => u.hostname === 'api.lever.co' && u.pathname.startsWith('/v1/')
const ID = /^[A-Za-z0-9-]{8,64}$/

async function get<T>(key: string, path: string, params: Record<string, string | number | boolean | string[]> = {}): Promise<T> {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) for (const one of Array.isArray(v) ? v : [v]) q.append(k, String(one))
  const res = await atsFetch(`${API}${path}${q.size ? `?${q}` : ''}`, { label: LABEL, auth: basicAuth(key), allowed })
  return (await res.json()) as T
}

async function list<T>(key: string, path: string, params: Record<string, string | number | boolean | string[]>, maxPages = 10): Promise<T[]> {
  const out: T[] = []
  let offset: string | undefined
  for (let page = 0; page < maxPages; page++) {
    const body = await get<{ data: T[]; hasNext?: boolean; next?: string }>(key, path, { ...params, limit: 100, ...(offset ? { offset } : {}) })
    out.push(...(body.data ?? []))
    if (!body.hasNext || !body.next) break
    offset = body.next
  }
  return out
}

type Posting = { id: string; text: string; reqCode?: string | null; state?: string; content?: { description?: string; descriptionHtml?: string; lists?: Array<{ text: string; content: string }>; closing?: string } }
type Opportunity = {
  id: string
  name: string | null
  emails?: string[]
  stage?: { text?: string } | string | null
  archived?: { archivedAt?: number; reason?: string } | null
  createdAt?: number
  applications?: string[]
}
type Resume = { id: string; createdAt?: number; file?: { name?: string; ext?: string; uploadedAt?: number; status?: string } }

const stageText = (s: Opportunity['stage']) => (typeof s === 'object' && s ? s.text ?? null : null)

export const leverAdapter: Adapter = {
  provider: 'lever',
  validJobId: (s) => ID.test(s),
  validKey: (s) => ID.test(s),
  parseConnect({ secret }) {
    const key = (secret ?? '').trim()
    if (key.length < 16 || key.length > 300 || /\s/.test(key)) return { ok: false, error: 'Paste the API key from Lever.' }
    // There's no account name in a Lever key; keep a short hint to show which key is connected.
    return { ok: true, clientId: `key-${key.slice(-4)}`, secret: key }
  },
  hint: (clientId) => `key …${clientId.replace(/^key-/, '')}`,
  async verify(c) {
    await get(c.secret, '/postings', { limit: 1 })
  },
  canComment: () => true,
  async listJobs(c) {
    const [published, internal] = await Promise.all([
      list<Posting>(c.secret, '/postings', { state: 'published' }, 5),
      list<Posting>(c.secret, '/postings', { state: 'internal' }, 5),
    ])
    return [...published, ...internal].map((p) => ({ id: p.id, name: p.text, requisition_id: p.reqCode ?? null }))
  },
  async jobText(c, jobId) {
    const { data: p } = await get<{ data: Posting }>(c.secret, `/postings/${jobId}`)
    const parts = [
      p.content?.description || (p.content?.descriptionHtml ? htmlToText(p.content.descriptionHtml) : ''),
      ...(p.content?.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`),
      p.content?.closing ?? '',
    ].filter(Boolean)
    return parts.length ? { title: p.text, text: parts.join('\n\n') } : null
  },
  async listApplicants(c, jobId) {
    const opps = await list<Opportunity>(c.secret, '/opportunities', { posting_id: jobId, archived: false, expand: 'stage' }, 10)
    return opps.map((o): AtsApplicant => ({
      key: o.id,
      name: o.name,
      email: o.emails?.[0] ?? null,
      stage: stageText(o.stage),
      resume: null,
      resume_unknown: true, // resumes are a separate call per person; checked at import
      opted_out: false,
    }))
  },
  async fetchForImport(c, _jobId, key) {
    const { data: o } = await get<{ data: Opportunity }>(c.secret, `/opportunities/${key}`, { expand: 'stage' })
    if (o.archived && o.archived.archivedAt) return { status: 'skipped', reason: 'Archived in Lever' }
    const { data: resumes } = await get<{ data: Resume[] }>(c.secret, `/opportunities/${key}/resumes`)
    const usable = (resumes ?? []).filter((r) => r.file && r.file.status !== 'error').sort((a, b) => (b.file?.uploadedAt ?? b.createdAt ?? 0) - (a.file?.uploadedAt ?? a.createdAt ?? 0))
    const r = usable[0]
    if (!r) return { status: 'skipped', reason: 'No resume in Lever' }
    let dl
    try {
      dl = await downloadWithAuth(`${API}/opportunities/${key}/resumes/${r.id}/download`, { label: LABEL, auth: basicAuth(c.secret), allowed })
    } catch (e) {
      if (e instanceof AtsError && (e.status === 413 || e.status === 422)) return { status: 'skipped', reason: e.status === 413 ? e.message : 'Lever could not process this resume file' }
      throw e
    }
    const named = r.file?.name ? (r.file.ext && !r.file.name.toLowerCase().endsWith(`.${r.file.ext}`) ? `${r.file.name}.${r.file.ext}` : r.file.name) : null
    return {
      status: 'ok',
      name: o.name,
      email: o.emails?.[0] ?? null,
      stage: stageText(o.stage),
      file: { buffer: dl.buffer, filename: resumeFilename([named], dl.contentType, dl.disposition), contentType: dl.contentType },
      noteRef: { opportunityId: key },
    }
  },
  async postNote(c, ref, body) {
    const { opportunityId } = ref as { opportunityId: string }
    await atsFetch(`${API}/opportunities/${opportunityId}/notes`, { method: 'POST', label: LABEL, auth: basicAuth(c.secret), allowed, json: { value: body } })
  },
}
