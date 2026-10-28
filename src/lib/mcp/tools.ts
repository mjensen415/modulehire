// ModuleHire (classic) MCP tools, Phase 1: read-only.
//
// Design rule: the host model does the writing; these tools hand it the user's real data
// (library, jobs, live resume documents, fit). No tool here calls our own AI, so MCP reads
// cost us database queries only. check_fit returns the stored server fit when it is current
// and otherwise the client-side live estimate (src/lib/live-fit.ts), never a fresh AI score.
//
// IDs: `resume_id` is the generated_resumes id, the same id as the /resumes/[id] editor URL.
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { getActiveProfileId } from '@/lib/profile'
import { DIMENSIONS, sanitizeCriteria } from '@/lib/dimensions'
import { allBlocks, docText, parseResumeDoc, visibleDoc, type ResumeDoc } from '@/lib/resume-doc'
import { scoreLiveFit } from '@/lib/live-fit'
import { isProTier } from '@/lib/plan'
import { json, runTool, ToolError, type ToolEnv } from './run-tool'

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const

export function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://modulehire.com').replace(/\/+$/, '')
  return `${base}${path}`
}

const jobLabel = (jd: { extracted_job_title?: string | null; extracted_company?: string | null } | null) =>
  `${jd?.extracted_job_title || 'Untitled role'}${jd?.extracted_company ? ` at ${jd.extracted_company}` : ''}`

async function loadResumeDoc(env: ToolEnv, resumeId: string) {
  const { data: row, error } = await env.supabase
    .from('resume_documents')
    .select('id, doc, version, fit_report, job_description_id, updated_at')
    .eq('generated_resume_id', resumeId)
    .eq('user_id', env.userId)
    .maybeSingle()
  if (error) throw error
  if (!row) throw new ToolError('No editable resume found with that id. Use list_resumes to see the ones available.')
  const parsed = parseResumeDoc(row.doc)
  if (!parsed.ok) throw new ToolError('This resume document is damaged and cannot be read. Open it on modulehire.com.')
  return { row, doc: parsed.doc }
}

// The document as the model should see it: every editable line with its block id, so later
// edit tools can target lines precisely.
function docForModel(doc: ResumeDoc) {
  const shown = visibleDoc(doc)
  return {
    header: { name: shown.header.name, title: shown.header.title, contact: shown.header.contact },
    format: shown.format,
    hidden_sections: doc.hidden_sections ?? [],
    lines: allBlocks(shown).map(({ block, section, groupIndex }) => ({
      block_id: block.id,
      section,
      ...(section === 'experience'
        ? { job: `${shown.experience[groupIndex]?.title ?? ''}, ${shown.experience[groupIndex]?.company ?? ''}`.replace(/^, |, $/g, '') }
        : {}),
      text: block.text,
      from_module: block.module_id,
    })),
    skills: shown.skills,
    awards: shown.awards || null,
  }
}

export function registerClassicTools(server: McpServer) {
  server.registerTool(
    'get_career_library',
    {
      title: 'Get career library',
      description:
        "Overview of the user's ModuleHire career library: profile, plan, work history, and how many skill modules they have per role and per dimension. Start here to understand who the user is before tailoring a resume.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async (_args, ctx) =>
      runTool('get_career_library', ctx.http?.authInfo, async (env) => {
        const profileId = await getActiveProfileId(env.supabase, env.userId)
        const [userRes, jobsRes, modulesRes, assignRes] = await Promise.all([
          env.supabase.from('users').select('name, location, linkedin_url, tier, preferences').eq('id', env.userId).maybeSingle(),
          env.supabase
            .from('job_experiences')
            .select('id, company, title, start_date, end_date')
            .eq('user_id', env.userId)
            .order('start_date', { ascending: false, nullsFirst: false }),
          env.supabase
            .from('modules')
            .select('id, dimensions, pinned')
            .eq('user_id', env.userId)
            .eq('profile_id', profileId)
            .is('deleted_at', null),
          env.supabase.from('module_job_assignments').select('module_id, job_id'),
        ])
        if (jobsRes.error) throw jobsRes.error
        if (modulesRes.error) throw modulesRes.error

        const modules = modulesRes.data ?? []
        const moduleIds = new Set(modules.map((m) => m.id))
        const perJob = new Map<string, number>()
        for (const a of assignRes.data ?? []) {
          if (moduleIds.has(a.module_id)) perJob.set(a.job_id, (perJob.get(a.job_id) ?? 0) + 1)
        }
        const perDimension = Object.fromEntries(
          DIMENSIONS.map((d) => [d, modules.filter((m) => (m.dimensions ?? []).includes(d)).length]),
        )
        const prefs = (userRes.data?.preferences ?? {}) as { target_roles?: string[]; career_level?: string }

        return json({
          name: userRes.data?.name ?? null,
          location: userRes.data?.location ?? null,
          plan: isProTier(userRes.data?.tier) ? 'pro' : 'free',
          targeting: { roles: prefs.target_roles ?? [], career_level: prefs.career_level ?? null },
          total_modules: modules.length,
          pinned_modules: modules.filter((m) => m.pinned).length,
          modules_per_dimension: perDimension,
          work_history: (jobsRes.data ?? []).map((j) => ({
            experience_id: j.id,
            company: j.company,
            title: j.title,
            start: j.start_date,
            end: j.end_date ?? 'present',
            modules: perJob.get(j.id) ?? 0,
          })),
          library_url: appUrl('/library'),
        })
      }),
  )

  server.registerTool(
    'search_modules',
    {
      title: 'Search skill modules',
      description:
        "Search the user's skill modules: the reusable, fact-checked accomplishment blocks every ModuleHire resume is built from. Filter by text, company, or dimension. Use these as the only source of facts when writing resume content; do not invent numbers, names, or claims that no module supports.",
      inputSchema: z.object({
        query: z.string().max(200).optional().describe('Words to match in the module title or content'),
        company: z.string().max(200).optional().describe('Only modules from this company'),
        dimension: z.enum(DIMENSIONS).optional().describe('Only modules tagged with this dimension'),
        limit: z.number().int().min(1).max(100).default(25),
      }),
      annotations: READ_ONLY,
    },
    async ({ query, company, dimension, limit }, ctx) =>
      runTool('search_modules', ctx.http?.authInfo, async (env) => {
        const profileId = await getActiveProfileId(env.supabase, env.userId)
        let q = env.supabase
          .from('modules')
          .select('id, title, content, source_company, source_role_title, date_start, date_end, dimensions, themes, pinned')
          .eq('user_id', env.userId)
          .eq('profile_id', profileId)
          .is('deleted_at', null)
        if (company) q = q.ilike('source_company', `%${company.replace(/[%_]/g, '')}%`)
        if (dimension) q = q.contains('dimensions', [dimension])
        if (query) {
          const term = query.replace(/[%_,()]/g, ' ').trim()
          if (term) q = q.or(`title.ilike.%${term}%,content.ilike.%${term}%`)
        }
        const { data, error } = await q.order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(limit)
        if (error) throw error
        return json({
          count: (data ?? []).length,
          modules: (data ?? []).map((m) => ({
            module_id: m.id,
            title: m.title,
            content: m.content,
            company: m.source_company,
            role: m.source_role_title,
            dates: [m.date_start, m.date_end ?? 'present'].filter(Boolean).join(' to '),
            dimensions: m.dimensions,
            pinned: m.pinned,
          })),
        })
      }),
  )

  server.registerTool(
    'list_jobs',
    {
      title: 'List target jobs',
      description:
        "Job postings the user has analyzed in ModuleHire, newest first, with their match score against the user's library when one exists.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
      annotations: READ_ONLY,
    },
    async ({ limit }, ctx) =>
      runTool('list_jobs', ctx.http?.authInfo, async (env) => {
        const { data, error } = await env.supabase
          .from('job_descriptions')
          .select('id, extracted_job_title, extracted_company, source_url, created_at, match_report')
          .eq('user_id', env.userId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(limit)
        if (error) throw error
        return json({
          jobs: (data ?? []).map((jd) => ({
            job_id: jd.id,
            role: jobLabel(jd),
            source_url: jd.source_url,
            added: jd.created_at,
            match_score: (jd.match_report as { overall?: number } | null)?.overall ?? null,
          })),
        })
      }),
  )

  server.registerTool(
    'get_job',
    {
      title: 'Get target job',
      description:
        "One analyzed job posting: the weighted requirements ModuleHire extracted, the key phrases, and the per-requirement match report against the user's library when available.",
      inputSchema: z.object({ job_id: z.uuid() }),
      annotations: READ_ONLY,
    },
    async ({ job_id }, ctx) =>
      runTool('get_job', ctx.http?.authInfo, async (env) => {
        const { data: jd, error } = await env.supabase
          .from('job_descriptions')
          .select('id, extracted_job_title, extracted_company, extracted_seniority, source_url, extracted_criteria, extracted_phrases, match_report, match_report_at')
          .eq('id', job_id)
          .eq('user_id', env.userId)
          .is('deleted_at', null)
          .maybeSingle()
        if (error) throw error
        if (!jd) throw new ToolError('No job with that id. Use list_jobs to see the available ones.')
        const report = jd.match_report as { overall?: number; criteria?: Array<{ label: string; score: number; bucket: string; why?: string }> } | null
        return json({
          job_id: jd.id,
          role: jobLabel(jd),
          seniority: jd.extracted_seniority ?? null,
          source_url: jd.source_url,
          requirements: sanitizeCriteria(jd.extracted_criteria).map((c) => ({
            label: c.label,
            dimension: c.dimension,
            weight: c.weight,
            description: c.description,
            also_called: c.also_called ?? [],
          })),
          key_phrases: Array.isArray(jd.extracted_phrases) ? jd.extracted_phrases : [],
          match_report: report
            ? {
                overall: report.overall ?? null,
                scored_at: jd.match_report_at,
                requirements: (report.criteria ?? []).map((c) => ({ label: c.label, score: c.score, bucket: c.bucket, why: c.why ?? null })),
              }
            : null,
          match_report_url: appUrl(`/matches/${jd.id}`),
        })
      }),
  )

  server.registerTool(
    'list_resumes',
    {
      title: 'List resumes',
      description: "The user's tailored resumes, newest first, with the job each was built for and whether it can be edited live.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
      annotations: READ_ONLY,
    },
    async ({ limit }, ctx) =>
      runTool('list_resumes', ctx.http?.authInfo, async (env) => {
        const { data, error } = await env.supabase
          .from('generated_resumes')
          .select('id, title, created_at, ats_score, job_descriptions (extracted_job_title, extracted_company)')
          .eq('user_id', env.userId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(limit)
        if (error) throw error
        const ids = (data ?? []).map((r) => r.id)
        const { data: docs } = ids.length
          ? await env.supabase.from('resume_documents').select('generated_resume_id, updated_at').in('generated_resume_id', ids)
          : { data: [] as { generated_resume_id: string; updated_at: string }[] }
        const docByResume = new Map((docs ?? []).map((d) => [d.generated_resume_id, d.updated_at]))
        return json({
          resumes: (data ?? []).map((r) => {
            const jd = (Array.isArray(r.job_descriptions) ? r.job_descriptions[0] : r.job_descriptions) as { extracted_job_title?: string; extracted_company?: string } | null
            return {
              resume_id: r.id,
              title: r.title,
              for_job: jd ? jobLabel(jd) : null,
              created: r.created_at,
              last_edited: docByResume.get(r.id) ?? null,
              editable: docByResume.has(r.id),
              ats_score: r.ats_score,
              url: appUrl(`/resumes/${r.id}`),
            }
          }),
        })
      }),
  )

  server.registerTool(
    'get_resume',
    {
      title: 'Get resume',
      description:
        'The full live resume document: every line with its block_id, section, job, and the skill module it was written from. This is the same document the ModuleHire editor shows; version identifies the saved state.',
      inputSchema: z.object({ resume_id: z.uuid() }),
      annotations: READ_ONLY,
    },
    async ({ resume_id }, ctx) =>
      runTool('get_resume', ctx.http?.authInfo, async (env) => {
        const { row, doc } = await loadResumeDoc(env, resume_id)
        return json({
          resume_id,
          version: row.version,
          last_edited: row.updated_at,
          ...docForModel(doc),
          editor_url: appUrl(`/resumes/${resume_id}`),
        })
      }),
  )

  server.registerTool(
    'check_fit',
    {
      title: 'Check resume fit',
      description:
        "How well a resume covers its target job's requirements, 0 to 100, per requirement. Returns ModuleHire's stored score when it matches the current version, otherwise a fast estimate on the same scale.",
      inputSchema: z.object({ resume_id: z.uuid() }),
      annotations: READ_ONLY,
    },
    async ({ resume_id }, ctx) =>
      runTool('check_fit', ctx.http?.authInfo, async (env) => {
        const { row, doc } = await loadResumeDoc(env, resume_id)
        const stored = row.fit_report as { overall: number; doc_version: number; criteria: Array<{ label: string; score: number; bucket: string; why: string }> } | null
        if (stored && stored.doc_version === row.version) {
          return json({ resume_id, source: 'scored', overall: stored.overall, requirements: stored.criteria })
        }
        if (!row.job_description_id) throw new ToolError('This resume has no target job to score against.')
        const { data: jd } = await env.supabase
          .from('job_descriptions')
          .select('extracted_criteria')
          .eq('id', row.job_description_id)
          .eq('user_id', env.userId)
          .maybeSingle()
        const criteria = sanitizeCriteria(jd?.extracted_criteria)
        if (criteria.length === 0) throw new ToolError("This resume's job has no requirements to score against.")
        const live = scoreLiveFit(docText(doc), criteria)
        return json({
          resume_id,
          source: 'estimate',
          note: 'Estimate on the same scale as the stored score; it can differ by a few points. Opening the resume in the editor refreshes the full score.',
          overall: live.score,
          requirements: live.criteria.map((c) => ({ label: c.label, weight: c.weight, covered: c.covered, matched: c.matched })),
        })
      }),
  )

  server.registerTool(
    'list_applications',
    {
      title: 'List job applications',
      description: "The user's job application tracker: company, role, status, dates, and match score.",
      inputSchema: z.object({
        status: z
          .enum(['saved', 'applied', 'screening', 'interviewing', 'offered', 'rejected', 'withdrawn', 'no_response'])
          .optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      annotations: READ_ONLY,
    },
    async ({ status, limit }, ctx) =>
      runTool('list_applications', ctx.http?.authInfo, async (env) => {
        let q = env.supabase
          .from('job_applications')
          .select('id, company, title, url, status, applied_at, updated_at, job_description_id, job_descriptions(match_report)')
          .eq('user_id', env.userId)
        if (status) q = q.eq('status', status)
        const { data, error } = await q.order('updated_at', { ascending: false }).limit(limit)
        if (error) throw error
        return json({
          applications: (data ?? []).map((a) => {
            const jd = (Array.isArray(a.job_descriptions) ? a.job_descriptions[0] : a.job_descriptions) as { match_report?: { overall?: number } | null } | null
            return {
              application_id: a.id,
              company: a.company,
              role: a.title,
              status: a.status,
              applied: a.applied_at,
              updated: a.updated_at,
              job_id: a.job_description_id,
              match_score: jd?.match_report?.overall ?? null,
              url: a.url,
            }
          }),
          tracker_url: appUrl('/job-tracker'),
        })
      }),
  )
}
