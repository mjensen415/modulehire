import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { parseModules } from '@/lib/parse-modules'

// Owner-only maintenance endpoint: wipes a user's parsed library and re-parses
// their most recent uploaded resume with the current (fixed) parser. Gated to
// the site owner by session email.
const ADMIN_EMAIL = 'mjensen415@gmail.com'

export async function POST(req: Request) {
  try {
    // Gate on the logged-in user's email from the session.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.email?.toLowerCase() !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { email } = await req.json()
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 })
    }
    const targetEmail = email.toLowerCase().trim()

    const admin = await createAdminClient()

    // 1. Resolve the target user by email.
    const { data: target, error: userErr } = await admin
      .from('users')
      .select('id')
      .eq('email', targetEmail)
      .maybeSingle()
    if (userErr) throw userErr
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // 2. Most recent non-deleted uploaded resume with raw text.
    const { data: resume, error: resumeErr } = await admin
      .from('resumes')
      .select('id, raw_text')
      .eq('user_id', target.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (resumeErr) throw resumeErr
    if (!resume?.raw_text) {
      return NextResponse.json(
        { error: 'No uploaded resume with raw text found for that user' },
        { status: 404 }
      )
    }

    // 3. Clear the existing library. FK cascades remove module_job_assignments,
    //    skill_module_assignments, and job_skills automatically.
    const { error: delModErr } = await admin.from('modules').delete().eq('user_id', target.id)
    if (delModErr) throw delModErr
    const { error: delJobErr } = await admin.from('job_experiences').delete().eq('user_id', target.id)
    if (delJobErr) throw delJobErr

    // 4. Re-parse with the current parser (single-job attribution).
    const result = await parseModules(admin, target.id, resume.id, resume.raw_text)

    return NextResponse.json({
      success: true,
      modules_created: result.modules?.length ?? 0,
    })
  } catch (error) {
    console.error('[admin/reparse-user]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
