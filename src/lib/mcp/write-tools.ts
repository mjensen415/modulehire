// ModuleHire (classic) MCP tools, Phase 3: write tools.
//
// Same design rule as the read tools: the host model writes, these tools store. Only
// generate_resume and interview_prep call our AI, and both go through the web app's own code
// path (the /api/jobs/start pipeline, src/lib/interview-prep.ts) so limits, caching, and
// logging match the website exactly.
//
// Resume edits save through saveResumeDoc with the version the model read. A stale version
// fails instead of overwriting an edit made in the browser (or by another chat).
import { createHash, randomBytes, randomUUID } from 'crypto'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { DIMENSIONS, isDimension } from '@/lib/dimensions'
import { getActiveProfileId } from '@/lib/profile'
import { findBlock, updateBlockText, type ResumeDoc } from '@/lib/resume-doc'
import { saveResumeDoc } from '@/lib/resume-doc-save'
import { unsupportedTerms } from '@/lib/fact-check'
import { docToRenderInput, renderResume } from '@/lib/resume-render'
import { APPLICATION_STATUSES, statusChangeFields } from '@/lib/tracker'
import { getInterviewPrep, InterviewPrepError } from '@/lib/interview-prep'
import { internalRequest } from '@/lib/internal-call'
import { POST as startJob } from '@/app/api/jobs/start/route'
import { json, runTool, ToolError, type ToolEnv } from './run-tool'
import { requireGenerationQuota, requireModuleRoom, requirePro } from './quota'
import { CARD_META, cardFor, docForModel, loadResumeDoc } from './tools'
import { withCard } from './card'
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { appUrl } from './urls'

// Annotations. destructiveHint is true only where a call overwrites something the user wrote.
const ADDS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const
const OVERWRITES = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const
const REARRANGES = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const

const EXPORT_TTL_SECONDS = 600
const LINK_TTL_MS = 5 * 60 * 1000

const STALE = (resumeId: string) =>
  `This resume changed since you read it (probably edited in the browser). Call get_resume for resume_id ${resumeId} again and redo the change on the current version.`

const today = () => new Date().toISOString().slice(0, 10)

/** Saves an edited doc, turning a stale version into a tool error. */
async function save(env: ToolEnv, resumeId: string, docId: string, version: number, doc: ResumeDoc) {
  const saved = await saveResumeDoc(env.supabase, env.userId, docId, version, doc)
  if (saved.ok) return saved
  if (saved.reason === 'conflict') throw new ToolError(STALE(resumeId))
  if (saved.reason === 'not_found') throw new ToolError('No resume found with that id. Use list_resumes to see the ones available.')
  throw new ToolError(`That change would make the resume invalid: ${saved.error}`)
}

/** Loads the doc and fails fast when the model's version is already out of date. */
async function loadForEdit(env: ToolEnv, resumeId: string, version: number) {
  const loaded = await loadResumeDoc(env, resumeId)
  if (loaded.row.version !== version) throw new ToolError(STALE(resumeId))
  return loaded
}

async function* ndjson(res: Response): AsyncGenerator<Record<string, unknown>> {
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) yield JSON.parse(line)
    }
  }
}

export function registerWriteTools(server: McpServer) {
  server.registerTool(
    'add_module',
    {
      title: 'Add skill module',
      description:
        "Save a new skill module (an accomplishment block) to the user's career library under one of their jobs. Use this when the user describes a win, project, or responsibility that isn't in their library yet. Write the content only from what the user told you; ask before adding numbers they didn't give. Get experience_id from get_career_library.",
      inputSchema: z.object({
        experience_id: z.uuid().describe('The job this belongs to (work_history[].experience_id from get_career_library)'),
        title: z.string().trim().min(3).max(200).describe('Short name for the accomplishment'),
        content: z.string().trim().min(20).max(5000).describe('The accomplishment in the user\'s words: what they did, how, and the result'),
        dimensions: z
          .array(z.enum(DIMENSIONS))
          .max(3)
          .optional()
          .describe('Up to 3 of: role, seniority, responsibility, skill, domain, collaboration'),
      }),
      annotations: ADDS,
    },
    async ({ experience_id, title, content, dimensions }, ctx) =>
      runTool('add_module', ctx.http?.authInfo, async (env) => {
        await requireModuleRoom(env)
        const { data: job, error: jobError } = await env.supabase
          .from('job_experiences')
          .select('id, company, title, start_date, end_date')
          .eq('id', experience_id)
          .eq('user_id', env.userId)
          .maybeSingle()
        if (jobError) throw jobError
        if (!job) throw new ToolError('No job with that experience_id. Use get_career_library to see the user\'s work history.')

        const profileId = await getActiveProfileId(env.supabase, env.userId)
        const dims = [...new Set((dimensions ?? []).filter(isDimension))].slice(0, 3)
        const { data: mod, error } = await env.supabase
          .from('modules')
          .insert({
            user_id: env.userId,
            profile_id: profileId,
            title,
            content,
            weight: 'supporting',
            type: 'experience',
            source_company: job.company,
            source_role_title: job.title,
            // Modules store YYYY-MM; job_experiences store the first of the month.
            date_start: job.start_date ? String(job.start_date).slice(0, 7) : null,
            date_end: job.end_date ? String(job.end_date).slice(0, 7) : null,
            dimensions: dims,
          })
          .select('id')
          .single()
        if (error) throw error

        const { error: linkError } = await env.supabase
          .from('module_job_assignments')
          .upsert({ module_id: mod.id, job_id: job.id })
        if (linkError) console.error('[mcp add_module] job link failed:', linkError)

        return json({
          module_id: mod.id,
          added_to: `${job.title ?? ''}${job.company ? ` at ${job.company}` : ''}`.trim(),
          linked_to_job: !linkError,
          library_url: appUrl(`/library/${mod.id}`),
        })
      }),
  )

  registerAppTool(
    server,
    'update_block',
    {
      title: 'Edit resume line',
      description:
        "Replace the text of one line of a resume. Pass the version and block_id from get_resume. Saves the change and returns the new version. If the new text names numbers or names its source module doesn't contain, the change is still saved and they come back as warnings: tell the user, and offer to add the fact to the module or undo it.",
      inputSchema: z.object({
        resume_id: z.uuid(),
        version: z.number().int().min(1).describe('The version from get_resume'),
        block_id: z.string().min(1).max(64),
        text: z.string().trim().min(1).max(2000),
      }),
      annotations: OVERWRITES,
      _meta: CARD_META,
    },
    async ({ resume_id, version, block_id, text }, ctx) =>
      runTool('update_block', ctx.http?.authInfo, async (env) => {
        const { row, doc } = await loadForEdit(env, resume_id, version)
        const block = findBlock(doc, block_id)
        if (!block) throw new ToolError('No line with that block_id on this resume. Call get_resume to see the current lines.')

        const nextDoc = updateBlockText(doc, block_id, text)
        const saved = await save(env, resume_id, row.id, version, nextDoc)

        // Same fact guard as the editor: flag, never block.
        let warnings: { kind: string; term: string }[] = []
        if (block.module_id) {
          const [{ data: mod }, { data: jd }] = await Promise.all([
            env.supabase.from('modules').select('title, content').eq('id', block.module_id).eq('user_id', env.userId).maybeSingle(),
            row.job_description_id
              ? env.supabase.from('job_descriptions').select('extracted_job_title, extracted_company').eq('id', row.job_description_id).maybeSingle()
              : Promise.resolve({ data: null }),
          ])
          if (mod) {
            const context = [
              doc.header.name, doc.header.title, jd?.extracted_company ?? '', jd?.extracted_job_title ?? '',
              ...doc.experience.flatMap((e) => [e.company, e.title]),
            ]
            warnings = unsupportedTerms(text, [mod.content, mod.title], context)
          }
        }

        const result = json({
          resume_id,
          version: saved.version,
          block_id,
          text,
          ...(warnings.length > 0
            ? {
                warnings: warnings.map((w) => ({ kind: w.kind, term: w.term })),
                warning_note: `Saved, but these ${warnings.length === 1 ? 'is' : 'are'} not in the skill module this line comes from. Check with the user that ${warnings.length === 1 ? 'it is' : 'they are'} accurate.`,
              }
            : {}),
        })
        return withCard(result, await cardFor(env, resume_id, { ...row, version: saved.version }, nextDoc))
      }),
  )

  server.registerTool(
    'reorder_blocks',
    {
      title: 'Reorder lines in a job',
      description:
        "Reorder the bullet lines under one job on a resume. job_index is the job's position in the experience section (0 is the first job shown); block_ids must list every line of that job exactly once, in the new order. Lines can't move between jobs.",
      inputSchema: z.object({
        resume_id: z.uuid(),
        version: z.number().int().min(1),
        job_index: z.number().int().min(0),
        block_ids: z.array(z.string().min(1).max(64)).min(1).max(40),
      }),
      annotations: REARRANGES,
    },
    async ({ resume_id, version, job_index, block_ids }, ctx) =>
      runTool('reorder_blocks', ctx.http?.authInfo, async (env) => {
        const { row, doc } = await loadForEdit(env, resume_id, version)
        const entry = doc.experience[job_index]
        if (!entry) throw new ToolError(`This resume has ${doc.experience.length} jobs; job_index must be 0 to ${doc.experience.length - 1}.`)
        const current = new Map(entry.bullets.map((b) => [b.id, b]))
        if (block_ids.length !== current.size || new Set(block_ids).size !== block_ids.length || block_ids.some((id) => !current.has(id))) {
          throw new ToolError(
            `block_ids must list each of this job's ${current.size} lines exactly once. Its lines are: ${entry.bullets.map((b) => b.id).join(', ')}.`,
          )
        }
        const next: ResumeDoc = {
          ...doc,
          experience: doc.experience.map((e, i) => (i === job_index ? { ...e, bullets: block_ids.map((id) => current.get(id)!) } : e)),
        }
        const saved = await save(env, resume_id, row.id, version, next)
        return json({ resume_id, version: saved.version, job: `${entry.title}, ${entry.company}`, order: block_ids })
      }),
  )

  server.registerTool(
    'set_section_visibility',
    {
      title: 'Show or hide a resume section',
      description:
        'Show or hide the summary, skills, education, or awards section of a resume. Hidden sections keep their content and come back when shown again.',
      inputSchema: z.object({
        resume_id: z.uuid(),
        version: z.number().int().min(1),
        section: z.enum(['summary', 'skills', 'education', 'awards']),
        visible: z.boolean(),
      }),
      annotations: REARRANGES,
    },
    async ({ resume_id, version, section, visible }, ctx) =>
      runTool('set_section_visibility', ctx.http?.authInfo, async (env) => {
        const { row, doc } = await loadForEdit(env, resume_id, version)
        const hidden = new Set(doc.hidden_sections ?? [])
        if (visible) hidden.delete(section)
        else hidden.add(section)
        const saved = await save(env, resume_id, row.id, version, { ...doc, hidden_sections: [...hidden] })
        return json({ resume_id, version: saved.version, hidden_sections: [...hidden] })
      }),
  )

  registerAppTool(
    server,
    'generate_resume',
    {
      title: 'Generate tailored resume',
      description:
        "Build a new tailored resume for a job from the user's skill modules, the same way modulehire.com does. Pass exactly one of job_id (a job from list_jobs), posting_text (the full posting), or posting_url. Takes about 30 seconds and counts toward the user's monthly resume limit, so confirm with the user first. If the posting has no job title, this returns an error with a job_id; ask the user for the title and call again with that job_id and job_title.",
      inputSchema: z.object({
        job_id: z.uuid().optional(),
        posting_text: z.string().min(50).max(50_000).optional(),
        posting_url: z.url().max(2000).optional(),
        job_title: z.string().trim().min(2).max(200).optional().describe('Only when a previous call asked for it'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: CARD_META,
    },
    async ({ job_id, posting_text, posting_url, job_title }, ctx) =>
      runTool('generate_resume', ctx.http?.authInfo, async (env) => {
        const sources = [job_id, posting_text, posting_url].filter(Boolean).length
        if (sources !== 1) throw new ToolError('Pass exactly one of job_id, posting_text, or posting_url.')
        if (job_title && !job_id) throw new ToolError('job_title goes with the job_id from the earlier call.')
        await requireGenerationQuota(env)

        if (job_id && job_title) {
          const { data: titled, error } = await env.supabase
            .from('job_descriptions')
            .update({ extracted_job_title: job_title, updated_at: new Date().toISOString() })
            .eq('id', job_id)
            .eq('user_id', env.userId)
            .select('id')
            .maybeSingle()
          if (error) throw error
          if (!titled) throw new ToolError('No job with that id. Use list_jobs to see the available ones.')
        }

        // The web pipeline, called in-process with the caller's bearer token (resolveAuth).
        const body = job_id ? { jd_id: job_id } : posting_url ? { url: posting_url } : { raw_text: posting_text }
        const res = await startJob(internalRequest(appUrl('/'), '/api/jobs/start', body, 'POST', { Authorization: `Bearer ${env.token}` }))
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new ToolError(data.error ?? 'ModuleHire could not start this resume. Try again.')
        }

        let resumeId: string | null = null
        let failure: string | null = null
        let needTitle: { jd_id: string; company: string } | null = null
        // Read to the end, not just to `document`: the pipeline keeps going (cover letter,
        // bookkeeping) after the document is saved.
        for await (const msg of ndjson(res)) {
          if (msg.type === 'document') resumeId = String(msg.resume_id)
          else if (msg.type === 'need_title') needTitle = { jd_id: String(msg.jd_id), company: String(msg.company ?? '') }
          else if (msg.type === 'error' && !resumeId) failure = String(msg.message ?? 'ModuleHire could not write this resume.')
        }

        if (needTitle) {
          throw new ToolError(
            `This posting${needTitle.company ? ` from ${needTitle.company}` : ''} doesn't state a job title. Ask the user what the role is called, then call generate_resume again with job_id "${needTitle.jd_id}" and job_title set to their answer.`,
          )
        }
        if (failure || !resumeId) throw new ToolError(failure ?? 'ModuleHire could not write this resume. Try again.')

        const { row, doc } = await loadResumeDoc(env, resumeId)
        const card = await cardFor(env, resumeId, row, doc)
        const result = json({
          resume_id: resumeId,
          job_id: row.job_description_id,
          for_job: card.for_job,
          version: row.version,
          fit: card.fit,
          editor_url: appUrl(`/resumes/${resumeId}`),
          ...docForModel(doc),
        })
        return withCard(result, card)
      }),
  )

  server.registerTool(
    'track_application',
    {
      title: 'Add job application',
      description: "Add a job application to the user's tracker. Link it to an analyzed job with job_id when there is one.",
      inputSchema: z.object({
        job_id: z.uuid().optional(),
        company: z.string().trim().min(1).max(200),
        title: z.string().trim().min(1).max(200),
        status: z.enum(APPLICATION_STATUSES).default('saved'),
        url: z.url().max(2000).optional(),
        notes: z.string().trim().max(5000).optional(),
      }),
      annotations: ADDS,
    },
    async ({ job_id, company, title, status, url, notes }, ctx) =>
      runTool('track_application', ctx.http?.authInfo, async (env) => {
        let jobDescriptionId: string | null = null
        if (job_id) {
          const { data: owned } = await env.supabase
            .from('job_descriptions')
            .select('id')
            .eq('id', job_id)
            .eq('user_id', env.userId)
            .maybeSingle()
          if (!owned) throw new ToolError('No job with that job_id. Use list_jobs, or leave job_id out.')
          jobDescriptionId = owned.id
        }
        const { data, error } = await env.supabase
          .from('job_applications')
          .insert({
            user_id: env.userId,
            company,
            title,
            url: url ?? null,
            notes: notes || null,
            status,
            job_description_id: jobDescriptionId,
            ...statusChangeFields({ status: 'saved', applied_at: null, first_response_at: null }, status, today()),
          })
          .select('id, status, applied_at')
          .single()
        if (error) throw error
        return json({ application_id: data.id, status: data.status, applied: data.applied_at, tracker_url: appUrl('/job-tracker') })
      }),
  )

  server.registerTool(
    'update_application_status',
    {
      title: 'Update application status',
      description:
        "Change the status of an application in the user's tracker. For a rejection, say whether it was automated or from a person if the user knows.",
      inputSchema: z.object({
        application_id: z.uuid(),
        status: z.enum(APPLICATION_STATUSES),
        rejection: z.enum(['automated', 'from_a_person']).optional(),
      }),
      annotations: OVERWRITES,
    },
    async ({ application_id, status, rejection }, ctx) =>
      runTool('update_application_status', ctx.http?.authInfo, async (env) => {
        const { data: app, error: loadError } = await env.supabase
          .from('job_applications')
          .select('id, company, title, status, applied_at, first_response_at')
          .eq('id', application_id)
          .eq('user_id', env.userId)
          .maybeSingle()
        if (loadError) throw loadError
        if (!app) throw new ToolError('No application with that id. Use list_applications to see them.')
        const extra = statusChangeFields(app, status, today(), rejection === 'from_a_person' ? 'human_reject' : 'auto_reject')
        const { data, error } = await env.supabase
          .from('job_applications')
          .update({ status, ...extra })
          .eq('id', application_id)
          .eq('user_id', env.userId)
          .select('id, status, applied_at, first_response_at')
          .single()
        if (error) throw error
        return json({
          application_id: data.id,
          role: `${app.title} at ${app.company}`,
          previous_status: app.status,
          status: data.status,
          applied: data.applied_at,
          first_response: data.first_response_at,
        })
      }),
  )

  server.registerTool(
    'interview_prep',
    {
      title: 'Interview prep',
      description:
        "Interview prep for one of the user's target jobs: the posting's key requirements matched to the user's own experience, a short pitch, questions to ask, and gaps to prepare for. Pro plan only. Cached for 7 days per job.",
      inputSchema: z.object({ job_id: z.uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ job_id }, ctx) =>
      runTool('interview_prep', ctx.http?.authInfo, async (env) => {
        await requirePro(env, 'Interview prep')
        try {
          const result = await getInterviewPrep(env.supabase, env.userId, job_id)
          return json({ job_id, ...result, prep_url: appUrl(`/interview-prep?jd=${job_id}`) })
        } catch (e) {
          if (e instanceof InterviewPrepError) {
            throw new ToolError(e.code === 'not_found' ? 'No job with that id. Use list_jobs to see the available ones.' : e.message)
          }
          throw e
        }
      }),
  )

  server.registerTool(
    'export_resume',
    {
      title: 'Download resume',
      description:
        'Render a resume as a PDF or Word file from its current saved version and return a download link. The link works for 10 minutes; share it with the user right away.',
      inputSchema: z.object({ resume_id: z.uuid(), format: z.enum(['pdf', 'docx']) }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ resume_id, format }, ctx) =>
      runTool('export_resume', ctx.http?.authInfo, async (env) => {
        const { row, doc } = await loadResumeDoc(env, resume_id)
        const rendered = await renderResume(docToRenderInput(doc))
        const { data: resume } = await env.supabase.from('generated_resumes').select('title').eq('id', resume_id).maybeSingle()
        const base = String(resume?.title || doc.header.name || 'Resume').replace(/[^\w\s.-]+/g, '').trim() || 'Resume'
        const filename = `${base}.${format}`

        // Exports live in the user's own folder of the private temp bucket. Clear out ones whose
        // links have expired so the folder doesn't grow.
        const folder = `${env.userId}/exports`
        const { data: existing } = await env.supabase.storage.from('temp').list(folder, { limit: 100 })
        const stale = (existing ?? [])
          .filter((f) => f.created_at && Date.now() - Date.parse(f.created_at) > EXPORT_TTL_SECONDS * 1000)
          .map((f) => `${folder}/${f.name}`)
        if (stale.length > 0) await env.supabase.storage.from('temp').remove(stale)

        const path = `${folder}/${randomUUID()}.${format}`
        const { error: uploadError } = await env.supabase.storage.from('temp').upload(path, format === 'pdf' ? rendered.pdf : rendered.docx, {
          contentType: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
        if (uploadError) throw uploadError
        const { data: signed, error: signError } = await env.supabase.storage
          .from('temp')
          .createSignedUrl(path, EXPORT_TTL_SECONDS, { download: filename })
        if (signError || !signed) throw signError ?? new Error('No signed URL')

        // Same measurement as the editor's downloads, marked as coming from MCP.
        const { error: logError } = await env.supabase.from('usage_events').insert({
          user_id: env.userId,
          action: 'ev_export',
          metadata: { type: format, resume_doc_id: row.id, saves: Math.max(0, (row.version ?? 1) - 1), jd_id: row.job_description_id, via: 'mcp' },
        })
        if (logError) console.error('[mcp export_resume] event log failed:', logError)

        return json({ resume_id, format, filename, download_url: signed.signedUrl, expires_in_minutes: EXPORT_TTL_SECONDS / 60 })
      }),
  )

  server.registerTool(
    'get_editor_link',
    {
      title: 'Open in editor',
      description:
        "A one-click link that opens a resume in ModuleHire's live editor, signed in. The link works once and expires in 5 minutes, so give it to the user right away and make a new one if they need it later.",
      inputSchema: z.object({ resume_id: z.uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ resume_id }, ctx) =>
      runTool('get_editor_link', ctx.http?.authInfo, async (env) => {
        const { data: resume } = await env.supabase
          .from('generated_resumes')
          .select('id')
          .eq('id', resume_id)
          .eq('user_id', env.userId)
          .is('deleted_at', null)
          .maybeSingle()
        if (!resume) throw new ToolError('No resume found with that id. Use list_resumes to see the ones available.')

        // Only the hash is stored; the token itself exists only in the link we return.
        const token = randomBytes(32).toString('base64url')
        const { error } = await env.supabase.from('mcp_link_tokens').insert({
          user_id: env.userId,
          resume_id,
          token_hash: createHash('sha256').update(token).digest('hex'),
          expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString(),
        })
        if (error) throw error
        return json({ resume_id, url: appUrl(`/go/${token}`), expires_in_minutes: LINK_TTL_MS / 60_000, single_use: true })
      }),
  )
}
