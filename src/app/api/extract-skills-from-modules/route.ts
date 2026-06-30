import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAndLog } from '@/lib/rate-limit'
import { extractSkillsFromContent } from '@/lib/parse-modules'

/**
 * Extract skills from a user's already-parsed modules, without a full reparse.
 * Optional body: { job_experience_id?: string } — when omitted, runs over all
 * the user's job_experiences. Rate-limited to 3/day.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Optional, tolerant of an empty/absent body.
    let jobExperienceId: string | undefined
    try {
      const body = await req.json()
      if (body && typeof body.job_experience_id === 'string') {
        jobExperienceId = body.job_experience_id
      }
    } catch {
      // No body — extract for all jobs.
    }

    const rl = await checkAndLog(supabase, user.id, 'rl_extract_skills', 3, 86400)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Daily limit reached. Try again tomorrow.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      )
    }

    // Resolve target jobs (verifying ownership).
    let jobQuery = supabase.from('job_experiences').select('id').eq('user_id', user.id)
    if (jobExperienceId) jobQuery = jobQuery.eq('id', jobExperienceId)
    const { data: jobs, error: jobsError } = await jobQuery
    if (jobsError) throw jobsError

    if (jobExperienceId && (!jobs || jobs.length === 0)) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
    }

    let jobsProcessed = 0
    let skillsAdded = 0

    for (const job of jobs ?? []) {
      // Modules linked to this job, scoped to the user via the join.
      const { data: links, error: linksError } = await supabase
        .from('module_job_assignments')
        .select('modules!inner(content, user_id)')
        .eq('job_id', job.id)
        .eq('modules.user_id', user.id)
      if (linksError) throw linksError

      const contents = (links ?? [])
        .map(l => {
          const mod = (l as { modules: { content?: string } | { content?: string }[] }).modules
          const single = Array.isArray(mod) ? mod[0] : mod
          return String(single?.content ?? '').trim()
        })
        .filter(Boolean)

      // No modules → nothing to extract from.
      if (contents.length === 0) continue

      let skills
      try {
        skills = await extractSkillsFromContent(contents.join('\n\n'))
      } catch (err) {
        console.error(`[parse-modules/skills] extraction failed for job ${job.id}:`, err)
        continue
      }

      jobsProcessed++
      if (skills.length === 0) continue

      // ON CONFLICT DO NOTHING on (job_id, name) so user-confirmed skills win.
      // ignoreDuplicates means .select() returns only the newly inserted rows.
      const { data: inserted, error: upsertError } = await supabase
        .from('job_skills')
        .upsert(
          skills.map(s => ({
            user_id: user.id,
            job_id: job.id,
            name: s.skill,
            category: s.category,
            source: 'parsed',
          })),
          { onConflict: 'job_id,name', ignoreDuplicates: true }
        )
        .select('id')
      if (upsertError) throw upsertError
      skillsAdded += inserted?.length ?? 0
    }

    return NextResponse.json({
      success: true,
      jobs_processed: jobsProcessed,
      skills_added: skillsAdded,
    })
  } catch (e) {
    console.error('[extract-skills-from-modules POST]', e)
    return NextResponse.json({ error: 'Could not extract skills.' }, { status: 500 })
  }
}
