// The contract every direct ATS connection implements (server only). Routes under
// /api/business/integrations/[provider] call these, so adding an ATS is one adapter file plus an
// entry in registry.ts and adapters.ts.
import type { Provider } from './registry'

export type AtsConn = { clientId: string; secret: string; config: Record<string, unknown> }
export type AtsJob = { id: string; name: string; requisition_id: string | null }
export type AtsApplicant = {
  key: string // the id the import call takes (application, candidate or opportunity id)
  name: string | null
  email: string | null
  stage: string | null
  resume: { filename: string } | null
  resume_unknown: boolean // the list call can't tell; checked at import
  opted_out: boolean // opted out of AI review in the ATS: never imported
}
export type ImportFetch =
  | {
      status: 'ok'
      name: string | null
      email: string | null
      stage: string | null
      file: { buffer: Buffer; filename: string; contentType: string }
      noteRef: unknown // passed back to postNote
    }
  | { status: 'skipped'; reason: string }

export type Adapter = {
  provider: Provider
  validJobId: (s: string) => boolean
  validKey: (s: string) => boolean
  parseConnect: (input: { account?: string; secret?: string; secret2?: string }) => { ok: true; clientId: string; secret: string } | { ok: false; error: string }
  hint: (clientId: string) => string
  verify: (c: AtsConn) => Promise<void>
  /** Extra settings found at connect time (e.g. the Workable member comments are posted as). */
  afterConnect?: (c: AtsConn, userEmail: string | null) => Promise<Record<string, unknown>>
  canComment: (c: AtsConn) => boolean
  listJobs: (c: AtsConn) => Promise<AtsJob[]>
  jobText: (c: AtsConn, jobId: string) => Promise<{ title: string; text: string } | null>
  listApplicants: (c: AtsConn, jobId: string) => Promise<AtsApplicant[]>
  fetchForImport: (c: AtsConn, jobId: string, key: string) => Promise<ImportFetch>
  postNote: (c: AtsConn, noteRef: unknown, body: string) => Promise<void>
}
