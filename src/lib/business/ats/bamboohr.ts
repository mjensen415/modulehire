// BambooHR applicant tracking connector. Auth: a user API key (the user's name menu, API Keys) sent
// as the Basic auth username with any password; the key acts as that user, who needs access to
// Hiring (ATS settings). Base: https://{companyDomain}.bamboohr.com/api/v1.
// Docs: https://documentation.bamboohr.com (Applicant Tracking). Paging: `nextPageUrl` +
// `paginationComplete`. The job summaries API has no description text, so a posting can't be
// started from a BambooHR job; resumes come from the application's attachment links.
import { AtsError, atsFetch, basicAuth, downloadPublic, downloadWithAuth, resumeFilename } from './http'
import type { Adapter, AtsApplicant, AtsConn } from './types'

const LABEL = 'BambooHR'
const DOMAIN = /^[a-z0-9][a-z0-9-]{0,62}$/
const NUM = /^\d{1,12}$/

export function normalizeBambooDomain(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/\.bamboohr\.com$/, '')
  return DOMAIN.test(s) ? s : null
}

const base = (c: AtsConn) => `https://${c.clientId}.bamboohr.com/api/v1`
const allowedFor = (c: AtsConn) => (u: URL) => u.hostname === `${c.clientId}.bamboohr.com`

async function get<T>(c: AtsConn, pathOrUrl: string): Promise<T> {
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${base(c)}${pathOrUrl}`
  const res = await atsFetch(url, { label: LABEL, auth: basicAuth(c.secret, 'x'), allowed: allowedFor(c) })
  return (await res.json()) as T
}

type Job = { id: number; title?: { label?: string } | null; status?: { label?: string } }
type AppRow = { id: number; status?: { label?: string }; applicant?: { firstName?: string; lastName?: string; email?: string }; job?: { id?: number } }
type AppDetail = AppRow & {
  resumeFileId?: number | null
  attachments?: Array<{ id: number; name?: string; fileUrl?: string }> | null
}

const nameOf = (a?: AppRow['applicant']) => [a?.firstName, a?.lastName].filter(Boolean).join(' ') || null
const CLOSED = /hired|rejected|not a fit|declined|withdrawn/i

export const bamboohrAdapter: Adapter = {
  provider: 'bamboohr',
  validJobId: (s) => NUM.test(s),
  validKey: (s) => NUM.test(s),
  parseConnect({ account, secret }) {
    const domain = normalizeBambooDomain(account ?? '')
    if (!domain) return { ok: false, error: 'Enter your BambooHR company domain (the "acme" in acme.bamboohr.com).' }
    const key = (secret ?? '').trim()
    if (key.length < 16 || key.length > 300 || /\s/.test(key)) return { ok: false, error: 'Paste the API key from BambooHR.' }
    return { ok: true, clientId: domain, secret: key }
  },
  hint: (clientId) => `${clientId}.bamboohr.com`,
  async verify(c) {
    try {
      await get(c, '/applicant_tracking/jobs?statusGroups=Open')
    } catch (e) {
      if (e instanceof AtsError && e.status === 404) throw new AtsError(`No BambooHR account at ${c.clientId}.bamboohr.com, or Hiring isn't turned on.`, 404, 'auth')
      throw e
    }
  },
  canComment: () => true,
  async listJobs(c) {
    const jobs = await get<Job[]>(c, '/applicant_tracking/jobs?statusGroups=Open')
    return (Array.isArray(jobs) ? jobs : []).map((j) => ({ id: String(j.id), name: j.title?.label ?? `Job ${j.id}`, requisition_id: null }))
  },
  async jobText() {
    return null
  },
  async listApplicants(c, jobId) {
    const out: AppRow[] = []
    let next: string | null = `/applicant_tracking/applications?jobId=${encodeURIComponent(jobId)}&applicationStatus=ALL_ACTIVE`
    for (let page = 0; next && page < 20; page++) {
      const body: { applications?: AppRow[]; paginationComplete?: boolean; nextPageUrl?: string | null } = await get(c, next)
      out.push(...(body.applications ?? []))
      if (body.paginationComplete || !body.nextPageUrl) break
      const n: string | null = body.nextPageUrl.startsWith(`https://${c.clientId}.bamboohr.com/`) ? body.nextPageUrl : null
      next = n && n !== next ? n : null
    }
    return out.map((a): AtsApplicant => ({
      key: String(a.id),
      name: nameOf(a.applicant),
      email: a.applicant?.email ?? null,
      stage: a.status?.label ?? null,
      resume: null,
      resume_unknown: true,
      opted_out: false,
    }))
  },
  async fetchForImport(c, jobId, key) {
    const a = await get<AppDetail>(c, `/applicant_tracking/applications/${key}`)
    if (a.job?.id !== undefined && String(a.job.id) !== jobId) return { status: 'skipped', reason: 'Not on this BambooHR job' }
    if (a.status?.label && CLOSED.test(a.status.label)) return { status: 'skipped', reason: `${a.status.label} in BambooHR` }
    const atts = a.attachments ?? []
    const resume = (a.resumeFileId ? atts.find((x) => x.id === a.resumeFileId) : null)
      ?? atts.find((x) => /resume|cv/i.test(x.name ?? '') && x.fileUrl)
    if (!a.resumeFileId && !resume) return { status: 'skipped', reason: 'No resume in BambooHR' }
    if (!resume?.fileUrl) return { status: 'skipped', reason: "BambooHR didn't return a download link for this resume" }
    let dl
    try {
      const u = new URL(resume.fileUrl, base(c))
      dl = u.hostname === `${c.clientId}.bamboohr.com`
        ? await downloadWithAuth(u.toString(), { label: LABEL, auth: basicAuth(c.secret, 'x'), allowed: allowedFor(c) })
        : await downloadPublic(u.toString(), LABEL)
    } catch (e) {
      if (e instanceof AtsError && e.status === 413) return { status: 'skipped', reason: e.message }
      throw e
    }
    return {
      status: 'ok',
      name: nameOf(a.applicant),
      email: a.applicant?.email ?? null,
      stage: a.status?.label ?? null,
      file: { buffer: dl.buffer, filename: resumeFilename([resume.name], dl.contentType, dl.disposition, dl.finalUrl), contentType: dl.contentType },
      noteRef: { applicationId: key },
    }
  },
  async postNote(c, ref, body) {
    const { applicationId } = ref as { applicationId: string }
    await atsFetch(`${base(c)}/applicant_tracking/applications/${applicationId}/comments`, {
      method: 'POST', label: LABEL, auth: basicAuth(c.secret, 'x'), allowed: allowedFor(c), json: { type: 'comment', comment: body },
    })
  },
}
