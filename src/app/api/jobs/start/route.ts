import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { checkAndLog } from '@/lib/rate-limit'
import { sanitizeCriteria, type JdCriterion } from '@/lib/dimensions'
import { autoPickModules, jobResolver, AUTO_PICK, type JobRow, type RankedForPick } from '@/lib/job-grouping'
import { finishMatch, loadMatchInputs, localShortlist, MatchError, rescoreShortlist } from '@/lib/match'
import { draftGenerateBody } from '@/lib/draft-request'
import { internalRequest } from '@/lib/internal-call'
import { POST as analyzeJd } from '@/app/api/analyze-jd/route'
import { POST as fetchJdUrl } from '@/app/api/fetch-jd-url/route'
import { GET as latestMatchRun } from '@/app/api/match-runs/route'
import { POST as generateResume } from '@/app/api/generate-resume/route'

export const maxDuration = 300

type Basics = {
  jd_id: string
  extracted_company: string | null
  extracted_job_title: string | null
  extracted_role_type: string | null
  extracted_seniority: string | null
  extracted_themes: string[]
  extracted_phrases: string[]
}

type Ranked = RankedForPick & { title?: string }

// How long matching waits for the criteria pass after the shortlist is ready. Criteria sharpen
// the shortlist; when they're slower than this, pass 2 runs on the basics-only shortlist and
// is never restarted.
const CRITERIA_GRACE_MS = 4500

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

const sleep = (ms: number) => new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), ms))

/**
 * POST { raw_text } | { url } | { jd_id } → NDJSON, one line per stage:
 *   {"type":"basics", jd_id, title, company}   posting read
 *   {"type":"criteria", count}                 requirements extracted
 *   {"type":"need_title", jd_id}               posting has no title — ask, then call again with { jd_id }
 *   {"type":"match", picked}                   modules chosen for you
 *   {"type":"draft_summary", text}             the resume filling in, as it's written
 *   {"type":"draft_job", index, entry}
 *   {"type":"document", resume_id, resume_doc_id}
 *   {"type":"done"} | {"type":"error", stage, message, code?}
 * Stages overlap: the shortlist is built as soon as the basics are in, re-ranked when criteria
 * land (if they land within CRITERIA_GRACE_MS), and the document streams job by job. Each
 * stage's timing is logged to usage_events (ev_stage_*).
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const rawInput = typeof body?.raw_text === 'string' ? body.raw_text : ''
  const urlInput = typeof body?.url === 'string' ? body.url.trim() : ''
  const jdIdInput = isUuid(body?.jd_id) ? body.jd_id as string : null
  if (!jdIdInput && !urlInput && rawInput.trim().length < 50) {
    return NextResponse.json({ error: 'Paste the job posting (or its link) to start.' }, { status: 400 })
  }
  const startedAt = Date.now()
  const base = req.url

  const stream = new ReadableStream({
    async start(controller) {
      // The client may leave as soon as `document` arrives; sends after that are dropped.
      const send = (obj: unknown) => {
        try { controller.enqueue(new TextEncoder().encode(JSON.stringify(obj) + '\n')) } catch { /* client gone */ }
      }
      let stage = 'basics'
      const fail = (message: string, code?: string) => send({ type: 'error', stage, message, ...(code ? { code } : {}) })

      // Stage timing, logged once at the end (ms from paste, and each stage's own duration).
      const timing: Record<string, { at_ms: number; duration_ms: number; [k: string]: unknown }> = {}
      const mark = (name: string, since: number, extra: Record<string, unknown> = {}) => {
        const now = Date.now()
        timing[name] = { at_ms: now - startedAt, duration_ms: now - since, ...extra }
      }
      const logTiming = (jdId: string | null, outcome: string) => {
        const rows = Object.entries(timing).map(([name, t]) => ({
          user_id: user.id,
          action: `ev_stage_${name}`,
          metadata: { ...t, jd_id: jdId, outcome, reused_jd: !!jdIdInput },
        }))
        if (rows.length === 0) return
        supabase.from('usage_events').insert(rows).then(({ error }) => { if (error) console.error('[jobs/start] stage log failed:', error) })
      }

      let jdIdForLog: string | null = jdIdInput
      try {
        // ── 1. The posting: analyze it (streamed), or load it ───────────────
        let resolveBasics!: (b: Basics | null) => void
        let resolveCriteria!: (c: JdCriterion[] | null) => void
        const basicsReady = new Promise<Basics | null>(r => { resolveBasics = r })
        const criteriaReady = new Promise<JdCriterion[] | null>(r => { resolveCriteria = r })
        let analysisError: string | null = null
        let analysis: Promise<void> = Promise.resolve()

        if (jdIdInput) {
          const { data: jd } = await supabase
            .from('job_descriptions')
            .select('id, extracted_company, extracted_job_title, extracted_role_type, extracted_seniority, extracted_themes, extracted_phrases, extracted_criteria')
            .eq('id', jdIdInput)
            .eq('user_id', user.id)
            .maybeSingle()
          if (!jd) { fail('We couldn\'t find that job.'); return }
          resolveBasics({
            jd_id: jd.id,
            extracted_company: jd.extracted_company,
            extracted_job_title: jd.extracted_job_title,
            extracted_role_type: jd.extracted_role_type,
            extracted_seniority: jd.extracted_seniority,
            extracted_themes: jd.extracted_themes ?? [],
            extracted_phrases: jd.extracted_phrases ?? [],
          })
          resolveCriteria(sanitizeCriteria(jd.extracted_criteria))
        } else {
          let rawText = rawInput
          if (urlInput && rawText.trim().length < 50) {
            const res = await fetchJdUrl(internalRequest(base, '/api/fetch-jd-url', { url: urlInput }))
            const data = await res.json().catch(() => ({}))
            if (!res.ok || typeof data.text !== 'string') { fail(data.error ?? 'We couldn\'t read that link. Paste the posting text instead.'); return }
            rawText = data.text
          }
          const res = await analyzeJd(internalRequest(base, '/api/analyze-jd', { raw_text: rawText }))
          if (!res.ok || !res.body) {
            const data = await res.json().catch(() => ({}))
            fail(data.error ?? 'We couldn\'t read this posting.')
            return
          }
          // Read the analysis in the background: matching starts on the basics line while the
          // criteria pass is still running.
          analysis = (async () => {
            try {
              for await (const msg of ndjson(res)) {
                if (msg.type === 'basics') resolveBasics(msg as unknown as Basics)
                else if (msg.type === 'criteria') resolveCriteria(sanitizeCriteria(msg.extracted_criteria))
                else if (msg.type === 'error' && msg.stage === 'basics') { analysisError = 'basics'; resolveBasics(null) }
                else if (msg.type === 'error' && msg.stage === 'criteria') resolveCriteria(null)
              }
            } finally {
              resolveBasics(null)
              resolveCriteria(null)
            }
          })()
        }

        const basics = await basicsReady
        if (!basics) { fail(analysisError ? 'We couldn\'t read this posting. Try pasting the full text.' : 'We couldn\'t read this posting.'); return }
        jdIdForLog = basics.jd_id
        mark('basics', startedAt)
        send({ type: 'basics', jd_id: basics.jd_id, title: basics.extracted_job_title ?? '', company: basics.extracted_company ?? '' })

        let criteriaCount = 0
        const criteriaSent = criteriaReady.then(criteria => {
          criteriaCount = criteria?.length ?? 0
          if (!timing.criteria) mark('criteria', startedAt, { count: criteriaCount })
          send({ type: 'criteria', count: criteriaCount })
          return criteria
        })

        // The only interruption before the draft: no job title in the posting.
        if (!basics.extracted_job_title) {
          await criteriaSent
          await analysis
          send({ type: 'need_title', jd_id: basics.jd_id, company: basics.extracted_company ?? '' })
          send({ type: 'done' })
          logTiming(jdIdForLog, 'need_title')
          return
        }

        // ── 2. Pick modules ─────────────────────────────────────────────────
        stage = 'match'
        const matchStarted = Date.now()
        let ranked: Ranked[] = []
        let stack: string[] = []
        let reusedRun = false
        let matchMeta: Record<string, unknown> = {}

        // A known JD with a logged run (Make another version): reuse it, no AI.
        if (jdIdInput) {
          const runRes = await latestMatchRun(internalRequest(base, `/api/match-runs?jd_id=${basics.jd_id}`, undefined, 'GET'))
          const run = (await runRes.json().catch(() => ({})))?.run
          if (run?.ranked_modules?.length) {
            ranked = run.ranked_modules as Ranked[]
            stack = (run.recommended_stack ?? []) as string[]
            reusedRun = true
          }
        }
        if (!reusedRun) {
          const limit = await checkAndLog(supabase, user.id, 'rl_match_modules', 60, 3600)
          if (!limit.ok) { fail('You\'ve matched a lot of jobs this hour. Try again in a little while.'); return }
          // The DB row already holds the basics (analyze-jd writes them before streaming them).
          const inputs = await loadMatchInputs(supabase, user.id, basics.jd_id)
          let { pass1, shortlist } = localShortlist(inputs.jd, inputs)
          // Criteria re-rank the shortlist locally if they arrive in time; pass 2 is never restarted.
          const early = await Promise.race([criteriaReady, sleep(CRITERIA_GRACE_MS)])
          const usedCriteria = early !== 'timeout' && !!early && early.length > 0
          if (usedCriteria) {
            inputs.jd = { ...inputs.jd, extracted_criteria: early }
            ;({ pass1, shortlist } = localShortlist(inputs.jd, inputs))
          }
          const rescored = await rescoreShortlist(inputs.jd, inputs, pass1, shortlist, user.id)
          const result = await finishMatch(supabase, user.id, inputs, rescored)
          ranked = result.ranked_modules as Ranked[]
          stack = result.recommended_stack
          matchMeta = { used_criteria: usedCriteria, library: inputs.modules.length }
        }
        if (ranked.length === 0) { fail('Your library is empty for this profile. Upload a resume first.'); return }

        const rankedIds = ranked.map(m => m.module_id)
        const [{ data: assignmentRows }, { data: jobRows }] = await Promise.all([
          supabase.from('module_job_assignments').select('module_id, job_id').in('module_id', rankedIds),
          supabase.from('job_experiences').select('id, company, title, start_date, end_date').eq('user_id', user.id),
        ])
        const jobs = (jobRows ?? []) as JobRow[]
        const picked = autoPickModules(ranked, stack, jobs, jobResolver(jobs, assignmentRows ?? []))
        if (picked.length === 0) { fail('None of your modules fit this job well enough to build a draft.'); return }
        mark('match', matchStarted, { picked: picked.length, reused_run: reusedRun, ...matchMeta })
        send({ type: 'match', picked: picked.length })

        // ── 3. Write the draft (streamed) ───────────────────────────────────
        stage = 'document'
        const documentStarted = Date.now()
        // The handlers are this app's own routes, called in-process: same request, same auth
        // cookies (next/headers reads them from the current request), no HTTP hop.
        const skillTitles = ranked.filter(m => m.type === 'skill' && m.match_score >= 70).map(m => String(m.title ?? ''))
        const genRes = await generateResume(internalRequest(base, '/api/generate-resume', await draftGenerateBody(
          supabase, user, basics, picked, skillTitles,
          { stream: true, bullets_per_role: { recent: AUTO_PICK.bulletsRecent, older: AUTO_PICK.bulletsOlder } },
        )))
        if (!genRes.ok) {
          const gen = await genRes.json().catch(() => ({}))
          fail(gen.error ?? 'We couldn\'t write the draft. Try again.', gen.code)
          return
        }

        let firstContentAt: number | null = null
        let documentSent = false
        for await (const msg of ndjson(genRes)) {
          if (msg.type === 'summary' || msg.type === 'job') {
            firstContentAt ??= Date.now() - startedAt
            send(msg.type === 'summary' ? { type: 'draft_summary', text: msg.text } : { type: 'draft_job', index: msg.index, entry: msg.entry })
          } else if (msg.type === 'document') {
            if (!msg.resume_doc_id) { fail('The draft was saved but couldn\'t be opened for editing. Find it in My Resumes.'); break }
            mark('document', documentStarted, { first_content_ms: firstContentAt, modules: picked.length })
            send({ type: 'document', resume_id: msg.resume_id, resume_doc_id: msg.resume_doc_id, ms: Date.now() - startedAt })
            documentSent = true
            // Measurement: time from paste to first draft. Fire-and-forget.
            supabase.from('usage_events').insert({
              user_id: user.id,
              action: 'ev_draft_created',
              metadata: { ms: Date.now() - startedAt, first_content_ms: firstContentAt, jd_id: basics.jd_id, resume_doc_id: msg.resume_doc_id, modules: picked.length, criteria: criteriaCount, reused_jd: !!jdIdInput },
            }).then(({ error }) => { if (error) console.error('[jobs/start] event log failed:', error) })
          } else if (msg.type === 'error') {
            if (!documentSent) fail(String(msg.message ?? 'We couldn\'t write the draft. Try again.'))
            break
          }
          // Keep reading after `document` so the cover letter and bookkeeping finish.
        }
        await analysis
        if (documentSent) send({ type: 'done' })
        logTiming(jdIdForLog, documentSent ? 'document' : 'failed')
      } catch (error) {
        console.error('[jobs/start]', error)
        const message = error instanceof MatchError ? error.message : (error as Error).message || 'Something went wrong. Try again.'
        fail(message)
        logTiming(jdIdForLog, 'error')
      } finally {
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } })
}
