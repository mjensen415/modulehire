import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { sanitizeCriteria } from '@/lib/dimensions'
import { autoPickModules, jobResolver, AUTO_PICK, type JobRow, type RankedForPick } from '@/lib/job-grouping'
import { jobLevelForSeniority, pickPositioningVariant } from '@/lib/resume-options'
import type { UserPreferences } from '@/lib/preferences'
import { POST as analyzeJd } from '@/app/api/analyze-jd/route'
import { POST as fetchJdUrl } from '@/app/api/fetch-jd-url/route'
import { POST as matchModules } from '@/app/api/match-modules/route'
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

// The handlers below are this app's own routes, called in-process: same request, same auth
// cookies (next/headers reads them from the current request), no HTTP hop.
function internalRequest(base: string, path: string, body?: unknown, method = 'POST'): Request {
  return new Request(new URL(path, base), {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

/**
 * POST { raw_text } | { url } | { jd_id } → NDJSON, one line per stage:
 *   {"type":"basics", jd_id, title, company}   posting read
 *   {"type":"criteria", count}                 requirements extracted
 *   {"type":"need_title", jd_id}               posting has no title — ask, then call again with { jd_id }
 *   {"type":"match", picked}                   modules chosen for you
 *   {"type":"document", resume_id, resume_doc_id}
 *   {"type":"done"} | {"type":"error", stage, message, code?}
 * The v2 flow: paste a posting, get an editable draft. Reuses analyze-jd (deduped by text
 * hash), the batched match-modules (or the latest logged run for a known JD), and
 * generate-resume (which writes the resume_documents row the editor opens).
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
      const send = (obj: unknown) => controller.enqueue(new TextEncoder().encode(JSON.stringify(obj) + '\n'))
      let stage = 'basics'
      const fail = (message: string, code?: string) => send({ type: 'error', stage, message, ...(code ? { code } : {}) })
      try {
        // ── 1. The posting: analyze it, or load it ──────────────────────────
        let basics: Basics | null = null
        let criteriaCount = 0
        let matchPromise: Promise<{ ranked: Ranked[]; stack: string[] } | null> | null = null

        const runMatch = async (jdId: string, reuseRun: boolean) => {
          if (reuseRun) {
            const runRes = await latestMatchRun(internalRequest(base, `/api/match-runs?jd_id=${jdId}`, undefined, 'GET'))
            const run = (await runRes.json().catch(() => ({})))?.run
            if (run?.ranked_modules?.length) return { ranked: run.ranked_modules as Ranked[], stack: (run.recommended_stack ?? []) as string[] }
          }
          const res = await matchModules(internalRequest(base, '/api/match-modules', { jd_id: jdId }))
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw Object.assign(new Error(data.error ?? 'We couldn\'t match your library to this job.'), { stage: 'match' })
          return { ranked: (data.ranked_modules ?? []) as Ranked[], stack: (data.recommended_stack ?? []) as string[] }
        }

        if (jdIdInput) {
          const { data: jd } = await supabase
            .from('job_descriptions')
            .select('id, extracted_company, extracted_job_title, extracted_role_type, extracted_seniority, extracted_themes, extracted_phrases, extracted_criteria')
            .eq('id', jdIdInput)
            .eq('user_id', user.id)
            .maybeSingle()
          if (!jd) { fail('We couldn\'t find that job.'); return }
          basics = {
            jd_id: jd.id,
            extracted_company: jd.extracted_company,
            extracted_job_title: jd.extracted_job_title,
            extracted_role_type: jd.extracted_role_type,
            extracted_seniority: jd.extracted_seniority,
            extracted_themes: jd.extracted_themes ?? [],
            extracted_phrases: jd.extracted_phrases ?? [],
          }
          criteriaCount = sanitizeCriteria(jd.extracted_criteria).length
          send({ type: 'basics', jd_id: jd.id, title: jd.extracted_job_title ?? '', company: jd.extracted_company ?? '' })
          send({ type: 'criteria', count: criteriaCount })
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
              if (!line) continue
              const msg = JSON.parse(line)
              if (msg.type === 'basics') {
                basics = msg as Basics
                send({ type: 'basics', jd_id: msg.jd_id, title: msg.extracted_job_title ?? '', company: msg.extracted_company ?? '' })
                // Matching only needs the basics — start it now, while criteria are still coming.
                if (msg.extracted_job_title) {
                  matchPromise = runMatch(msg.jd_id, false)
                  matchPromise.catch(() => {})
                }
              } else if (msg.type === 'criteria') {
                criteriaCount = sanitizeCriteria(msg.extracted_criteria).length
                send({ type: 'criteria', count: criteriaCount })
              } else if (msg.type === 'error' && msg.stage === 'basics') {
                fail('We couldn\'t read this posting. Try pasting the full text.')
                return
              }
            }
          }
          if (!basics) { fail('We couldn\'t read this posting. Try pasting the full text.'); return }
        }

        // The only interruption before the draft: no job title in the posting.
        if (!basics.extracted_job_title) {
          send({ type: 'need_title', jd_id: basics.jd_id, company: basics.extracted_company ?? '' })
          send({ type: 'done' })
          return
        }

        // ── 2. Pick modules ─────────────────────────────────────────────────
        stage = 'match'
        const match = await (matchPromise ?? runMatch(basics.jd_id, !!jdIdInput))
        if (!match || match.ranked.length === 0) { fail('Your library is empty for this profile. Upload a resume first.'); return }

        const rankedIds = match.ranked.map(m => m.module_id)
        const [{ data: assignmentRows }, { data: jobRows }] = await Promise.all([
          supabase.from('module_job_assignments').select('module_id, job_id').in('module_id', rankedIds),
          supabase.from('job_experiences').select('id, company, title, start_date, end_date').eq('user_id', user.id),
        ])
        const jobs = (jobRows ?? []) as JobRow[]
        const resolveJob = jobResolver(jobs, assignmentRows ?? [])
        const picked = autoPickModules(match.ranked, match.stack, jobs, resolveJob)
        if (picked.length === 0) { fail('None of your modules fit this job well enough to build a draft.'); return }
        send({ type: 'match', picked: picked.length })

        // ── 3. Write the draft ──────────────────────────────────────────────
        stage = 'document'
        const [{ data: profile }, { data: education }, { data: prefsRow }] = await Promise.all([
          supabase.from('users').select('name, email, phone, linkedin_url, location, summary').eq('id', user.id).single(),
          supabase.from('education').select('school, degree, field, year').eq('user_id', user.id).order('sort_order'),
          supabase.from('users').select('preferences').eq('id', user.id).single(),
        ])
        const defaults = (prefsRow?.preferences as UserPreferences | null)?.resume_defaults ?? {}
        const skills = match.ranked
          .filter(m => m.type === 'skill' && m.match_score >= 70)
          .map(m => String(m.title ?? '').trim())
          .filter(Boolean)
        const educationRows = (education ?? []).filter(e => e.school || e.degree)
        const includeSummary = defaults.include_summary ?? true
        const includeSkills = (defaults.include_skills ?? true) && skills.length > 0
        const includeEducation = (defaults.include_education ?? true) && educationRows.length > 0

        const genRes = await generateResume(internalRequest(base, '/api/generate-resume', {
          module_ids: picked,
          module_order: picked,
          jd_id: basics.jd_id,
          positioning_variant: pickPositioningVariant(basics),
          contact: {
            name: profile?.name || user.email || '',
            email: profile?.email || user.email || '',
            phone: profile?.phone ?? '',
            linkedin: profile?.linkedin_url ?? '',
            location: profile?.location ?? '',
          },
          // Their own saved summary, verbatim, when they have one.
          summary_override: includeSummary && profile?.summary ? profile.summary : undefined,
          education: includeEducation ? educationRows : [],
          skills: includeSkills ? skills : [],
          awards_text: '',
          include_skills_section: includeSkills,
          include_education_section: includeEducation,
          include_awards_section: false,
          include_summary: includeSummary,
          cover_letter: { include: !!defaults.include_cover_letter, tone: defaults.cover_letter_tone ?? 'professional' },
          job_level: jobLevelForSeniority(basics.extracted_seniority),
          format: defaults.format ?? 'classic',
          bullet_style: defaults.bullet_style ?? '•',
          confirmed_phrases: basics.extracted_phrases,
          confirmed_themes: basics.extracted_themes,
          bullets_per_role: { recent: AUTO_PICK.bulletsRecent, older: AUTO_PICK.bulletsOlder },
        }))
        const gen = await genRes.json().catch(() => ({}))
        if (!genRes.ok) { fail(gen.error ?? 'We couldn\'t write the draft. Try again.', gen.code); return }
        if (!gen.resume_doc_id) { fail('The draft was saved but couldn\'t be opened for editing. Find it in My Resumes.'); return }

        const msToDraft = Date.now() - startedAt
        send({ type: 'document', resume_id: gen.resume_id, resume_doc_id: gen.resume_doc_id, ms: msToDraft })

        // Measurement: time from paste to first draft. Fire-and-forget.
        supabase.from('usage_events').insert({
          user_id: user.id,
          action: 'ev_draft_created',
          metadata: { ms: msToDraft, jd_id: basics.jd_id, resume_doc_id: gen.resume_doc_id, modules: picked.length, criteria: criteriaCount, reused_jd: !!jdIdInput },
        }).then(({ error }) => { if (error) console.error('[jobs/start] event log failed:', error) })

        send({ type: 'done' })
      } catch (error) {
        console.error('[jobs/start]', error)
        const e = error as Error & { stage?: string }
        if (e.stage) stage = e.stage
        fail(e.message || 'Something went wrong. Try again.')
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } })
}
