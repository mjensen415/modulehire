// Ashby public API connector. Auth: an API key from Ashby (Admin, Integrations, API Keys) sent as
// the Basic auth username with a blank password. Every endpoint is a POST with a JSON body.
// Docs: https://developers.ashbyhq.com. Paging: `nextCursor` + `moreDataAvailable`.
// A missing permission is a 403 `missing_endpoint_permission`; some errors come back as 200 with
// `success: false`, which is treated as a failure here.
import { AtsError, atsFetch, basicAuth, downloadPublic, htmlToText, resumeFilename } from './http'
import type { Adapter, AtsApplicant } from './types'

const API = 'https://api.ashbyhq.com'
const LABEL = 'Ashby'
const allowed = (u: URL) => u.hostname === 'api.ashbyhq.com'
const ID = /^[A-Za-z0-9-]{8,64}$/

async function call<T>(key: string, endpoint: string, body: Record<string, unknown>): Promise<T> {
  const res = await atsFetch(`${API}/${endpoint}`, {
    method: 'POST',
    label: LABEL,
    auth: basicAuth(key),
    allowed,
    json: body,
    headers: { Accept: 'application/json; version=1' },
  })
  const data = (await res.json()) as { success: boolean; results?: T; errors?: Array<{ message?: string } | string>; errorInfo?: { code?: string; message?: string } }
  if (!data.success) {
    const msg = data.errorInfo?.message ?? (typeof data.errors?.[0] === 'string' ? data.errors[0] : data.errors?.[0]?.message) ?? 'request failed'
    if (/permission/i.test(msg) || data.errorInfo?.code === 'missing_endpoint_permission') {
      throw new AtsError('This Ashby key is missing a permission ModuleHire needs. Check its permissions in Ashby.', 403, 'scope')
    }
    throw new AtsError(`Ashby: ${String(msg).slice(0, 200)}`, 502)
  }
  return data as unknown as T
}

async function list<T>(key: string, endpoint: string, body: Record<string, unknown>, maxPages = 10): Promise<T[]> {
  const out: T[] = []
  let cursor: string | undefined
  for (let page = 0; page < maxPages; page++) {
    const r = await call<{ results: T[]; nextCursor?: string; moreDataAvailable?: boolean }>(key, endpoint, { ...body, limit: 100, ...(cursor ? { cursor } : {}) })
    out.push(...(r.results ?? []))
    if (!r.moreDataAvailable || !r.nextCursor) break
    cursor = r.nextCursor
  }
  return out
}

type Job = { id: string; title: string; status: string; customRequisitionId?: string | null; jobPostingIds?: string[] }
type FileHandle = { id?: string; name?: string; handle: string } | null
type Application = {
  id: string
  status: string
  candidate: { id: string; name: string; primaryEmailAddress?: { value?: string } | null }
  currentInterviewStage?: { title?: string } | null
  job: { id: string; title?: string }
  resumeFileHandle?: FileHandle
}

export const ashbyAdapter: Adapter = {
  provider: 'ashby',
  validJobId: (s) => ID.test(s),
  validKey: (s) => ID.test(s),
  parseConnect({ secret }) {
    const key = (secret ?? '').trim()
    if (key.length < 16 || key.length > 300 || /\s/.test(key)) return { ok: false, error: 'Paste the API key from Ashby.' }
    return { ok: true, clientId: `key-${key.slice(-4)}`, secret: key }
  },
  hint: (clientId) => `key …${clientId.replace(/^key-/, '')}`,
  async verify(c) {
    await call(c.secret, 'job.list', { limit: 1 })
  },
  canComment: () => true,
  async listJobs(c) {
    const jobs = await list<Job>(c.secret, 'job.list', { status: ['Open'] }, 5)
    return jobs.map((j) => ({ id: j.id, name: j.title, requisition_id: j.customRequisitionId ?? null }))
  },
  async jobText(c, jobId) {
    const { results: job } = await call<{ results: Job }>(c.secret, 'job.info', { id: jobId })
    const postingId = job.jobPostingIds?.[0]
    if (!postingId) return null
    const { results: p } = await call<{ results: { title: string; descriptionPlain?: string; descriptionHtml?: string } }>(
      c.secret, 'jobPosting.info', { jobPostingId: postingId, includeUnpublishedJobPostings: true },
    )
    const text = p.descriptionPlain || (p.descriptionHtml ? htmlToText(p.descriptionHtml) : '')
    return text ? { title: p.title || job.title, text } : null
  },
  async listApplicants(c, jobId) {
    const apps = await list<Application>(c.secret, 'application.list', { jobId, status: 'Active' }, 10)
    return apps.map((a): AtsApplicant => ({
      key: a.id,
      name: a.candidate?.name ?? null,
      email: a.candidate?.primaryEmailAddress?.value ?? null,
      stage: a.currentInterviewStage?.title ?? null,
      resume: null,
      resume_unknown: true,
      opted_out: false,
    }))
  },
  async fetchForImport(c, jobId, key) {
    const { results: a } = await call<{ results: Application }>(c.secret, 'application.info', { applicationId: key })
    if (a.job?.id !== jobId) return { status: 'skipped', reason: 'Not on this Ashby job' }
    if (a.status !== 'Active') return { status: 'skipped', reason: `${a.status} in Ashby` }
    let handle = a.resumeFileHandle
    if (!handle) {
      const { results: cand } = await call<{ results: { resumeFileHandle?: FileHandle } }>(c.secret, 'candidate.info', { id: a.candidate.id })
      handle = cand.resumeFileHandle ?? null
    }
    if (!handle?.handle) return { status: 'skipped', reason: 'No resume in Ashby' }
    const { results: f } = await call<{ results: { url: string } }>(c.secret, 'file.info', { fileHandle: handle.handle })
    let dl
    try {
      dl = await downloadPublic(f.url, LABEL)
    } catch (e) {
      if (e instanceof AtsError && e.status === 413) return { status: 'skipped', reason: e.message }
      throw e
    }
    return {
      status: 'ok',
      name: a.candidate?.name ?? null,
      email: a.candidate?.primaryEmailAddress?.value ?? null,
      stage: a.currentInterviewStage?.title ?? null,
      file: { buffer: dl.buffer, filename: resumeFilename([handle.name], dl.contentType, '', dl.finalUrl), contentType: dl.contentType },
      noteRef: { candidateId: a.candidate.id },
    }
  },
  async postNote(c, ref, body) {
    const { candidateId } = ref as { candidateId: string }
    await call(c.secret, 'candidate.createNote', { candidateId, note: body, sendNotifications: false })
  },
}
