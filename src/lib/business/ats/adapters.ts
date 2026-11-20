// Server-side registry of ATS adapters. Greenhouse and Workable wrap their own client modules;
// Lever, Ashby and BambooHR are self-contained adapters.
import * as gh from '../greenhouse'
import * as wk from '../workable'
import { AtsError, resumeFilename } from './http'
import { leverAdapter } from './lever'
import { ashbyAdapter } from './ashby'
import { bamboohrAdapter } from './bamboohr'
import type { Provider } from './registry'
import type { Adapter, AtsApplicant, AtsConn } from './types'

const ghCreds = (c: AtsConn): gh.GhCreds => ({ clientId: c.clientId, clientSecret: c.secret })
const wkCreds = (c: AtsConn): wk.WkCreds => ({ subdomain: c.clientId, token: c.secret })
const NUM = /^\d{1,15}$/

const greenhouseAdapter: Adapter = {
  provider: 'greenhouse',
  validJobId: (s) => NUM.test(s),
  validKey: (s) => NUM.test(s),
  parseConnect({ account, secret }) {
    const clientId = (account ?? '').trim()
    const clientSecret = (secret ?? '').trim()
    if (clientId.length < 4 || clientId.length > 200 || clientSecret.length < 8 || clientSecret.length > 500) {
      return { ok: false, error: 'Paste both the client ID and the client secret from Greenhouse.' }
    }
    return { ok: true, clientId, secret: clientSecret }
  },
  hint: (clientId) => `client ${clientId.length > 6 ? `…${clientId.slice(-4)}` : '…'}`,
  verify: (c) => gh.verifyCredentials(ghCreds(c)),
  canComment: () => true,
  async listJobs(c) {
    return (await gh.listOpenJobs(ghCreds(c))).map((j) => ({ id: String(j.id), name: j.name, requisition_id: j.requisition_id }))
  },
  jobText: (c, jobId) => gh.jobPostText(ghCreds(c), Number(jobId)),
  async listApplicants(c, jobId) {
    return (await gh.listJobApplicants(ghCreds(c), Number(jobId))).map((a): AtsApplicant => ({
      key: String(a.application_id), name: a.name, email: a.email, stage: a.stage, resume: a.resume, resume_unknown: false, opted_out: a.opted_out,
    }))
  },
  async fetchForImport(c, jobId, key) {
    const creds = ghCreds(c)
    const ghJobId = Number(jobId)
    const app = await gh.getApplication(creds, Number(key))
    if (!app || app.status !== 'in_process') return { status: 'skipped', reason: 'No longer in process in Greenhouse' }
    if (app.job_id !== ghJobId) return { status: 'skipped', reason: 'Not on this Greenhouse job' }
    // Fails closed: if the opt-out list can't be read, this throws and nothing is imported.
    if ((await gh.optedOutCandidates(creds, ghJobId)).has(app.candidate_id)) return { status: 'skipped', reason: 'Opted out of AI review' }
    const resume = await gh.resumeForApplication(creds, app.id)
    if (!resume) return { status: 'skipped', reason: 'No resume in Greenhouse' }
    let buffer: Buffer
    try {
      buffer = await gh.downloadAttachment(creds, resume)
    } catch (e) {
      if (e instanceof AtsError && e.status === 413) return { status: 'skipped', reason: e.message }
      throw e
    }
    const person = await gh.getCandidate(creds, app.candidate_id)
    return {
      status: 'ok', name: person.name, email: person.email, stage: app.stage_name,
      file: { buffer, filename: resumeFilename([resume.filename], ''), contentType: '' },
      noteRef: { candidateId: app.candidate_id, applicationId: app.id },
    }
  },
  async postNote(c, ref, body) {
    const r = ref as { candidateId: number; applicationId: number }
    await gh.postScoreNote(ghCreds(c), { candidateId: r.candidateId, applicationId: r.applicationId, body })
  },
}

const workableAdapter: Adapter = {
  provider: 'workable',
  validJobId: (s) => wk.isShortcode(s),
  validKey: (s) => /^[A-Za-z0-9]{2,40}$/.test(s),
  parseConnect({ account, secret }) {
    const subdomain = wk.normalizeSubdomain(account ?? '')
    if (!subdomain) return { ok: false, error: 'Enter your Workable subdomain (the "acme" in acme.workable.com).' }
    const token = (secret ?? '').trim()
    if (token.length < 16 || token.length > 500 || /\s/.test(token)) return { ok: false, error: 'Paste the API access token from Workable.' }
    return { ok: true, clientId: subdomain, secret: token }
  },
  hint: (clientId) => `${clientId}.workable.com`,
  verify: (c) => wk.verifyWorkable(wkCreds(c)),
  async afterConnect(c, email) {
    const memberId = await wk.findCommentMember(wkCreds(c), email).catch(() => null)
    return memberId ? { member_id: memberId } : {}
  },
  canComment: (c) => typeof c.config.member_id === 'string',
  async listJobs(c) {
    return wk.listOpenWorkableJobs(wkCreds(c))
  },
  jobText: (c, jobId) => wk.workableJobText(wkCreds(c), jobId),
  async listApplicants(c, jobId) {
    return (await wk.listWorkableApplicants(wkCreds(c), jobId)).map((a): AtsApplicant => ({
      key: a.candidate_id, name: a.name, email: a.email, stage: a.stage, resume: a.resume, resume_unknown: !a.resume, opted_out: false,
    }))
  },
  async fetchForImport(c, jobId, key) {
    const cand = await wk.getWorkableCandidate(wkCreds(c), key)
    if (cand.job?.shortcode && cand.job.shortcode !== jobId) return { status: 'skipped', reason: 'Not on this Workable job' }
    if (!wk.workableCandidateIsActive(cand)) return { status: 'skipped', reason: 'Disqualified or hired in Workable' }
    if (!cand.resume_url) return { status: 'skipped', reason: 'No resume in Workable' }
    let file
    try {
      file = await wk.downloadWorkableResume(cand)
    } catch (e) {
      if (e instanceof AtsError && e.status === 413) return { status: 'skipped', reason: e.message }
      throw e
    }
    return {
      status: 'ok', name: cand.name || [cand.firstname, cand.lastname].filter(Boolean).join(' ') || null,
      email: cand.email, stage: cand.stage, file, noteRef: { candidateId: key },
    }
  },
  async postNote(c, ref, body) {
    const memberId = c.config.member_id
    if (typeof memberId !== 'string') throw new AtsError('No Workable member to post comments as.', 409)
    await wk.postWorkableComment(wkCreds(c), { candidateId: (ref as { candidateId: string }).candidateId, memberId, body })
  },
}

export const ADAPTERS: Record<Provider, Adapter> = {
  greenhouse: greenhouseAdapter,
  workable: workableAdapter,
  lever: leverAdapter,
  ashby: ashbyAdapter,
  bamboohr: bamboohrAdapter,
}
