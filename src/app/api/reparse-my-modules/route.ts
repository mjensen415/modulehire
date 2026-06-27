import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkAndLog } from '@/lib/rate-limit'
import { parseModules } from '@/lib/parse-modules'

// Lets an authenticated user wipe and rebuild their own module library from
// their most recent uploaded resume. Rate-limited so it can't be hammered.
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Rate limit: max 2 re-parses per 24h (logged against usage_events).
    const limit = await checkAndLog(supabase, user.id, 'rl_reparse_modules', 2, 86400)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'You can only re-parse once per day. Try again tomorrow.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
      )
    }

    const admin = await createAdminClient()

    // Most recent non-deleted uploaded resume with raw text.
    const { data: resume, error: resumeErr } = await admin
      .from('resumes')
      .select('id, raw_text')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (resumeErr) throw resumeErr
    if (!resume?.raw_text) {
      return NextResponse.json({ error: 'No uploaded resume found. Upload a resume first.' }, { status: 404 })
    }

    // Clear the existing library. FK cascades remove module_job_assignments,
    // skill_module_assignments, and job_skills automatically.
    const { error: delModErr } = await admin.from('modules').delete().eq('user_id', user.id)
    if (delModErr) throw delModErr
    const { error: delJobErr } = await admin.from('job_experiences').delete().eq('user_id', user.id)
    if (delJobErr) throw delJobErr

    // Rebuild with the current parser.
    const result = await parseModules(admin, user.id, resume.id, resume.raw_text)

    return NextResponse.json({ success: true, modules_created: result.modules?.length ?? 0 })
  } catch (error) {
    console.error('[reparse-my-modules]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
