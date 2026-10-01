import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { parseModules, type ParseProgressEvent } from '@/lib/parse-modules'
import { getActiveProfileId } from '@/lib/profile'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid } from '@/lib/validate'

export const maxDuration = 300

type Contact = {
  full_name: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  location: string | null
  summary: string | null
  education: Array<{ school: string; degree: string; field: string; year: string }>
}

// Applies the same first-upload-only profile/summary/education auto-fill as before,
// regardless of whether the caller is the streaming or ?mode=json path.
async function applyContactSideEffects(
  adminSb: Awaited<ReturnType<typeof createAdminClient>>,
  userId: string,
  userEmail: string | undefined,
  contact: Contact | null
): Promise<boolean> {
  if (!contact) return false
  let profileUpdated = false

  const { data: existing } = await adminSb
    .from('users')
    .select('name, email, summary')
    .eq('id', userId)
    .single()

  const emailPrefix = (existing?.email ?? userEmail ?? '').split('@')[0]
  const profileIsEmpty = !existing?.name || existing.name.trim() === '' || existing.name === emailPrefix

  const profileUpdate: Record<string, string> = {}
  if (contact.full_name)    profileUpdate.name         = contact.full_name
  if (contact.email)        profileUpdate.email        = contact.email
  if (contact.phone)        profileUpdate.phone        = contact.phone
  if (contact.linkedin_url) profileUpdate.linkedin_url = contact.linkedin_url
  if (contact.location)     profileUpdate.location     = contact.location

  if (profileIsEmpty && Object.keys(profileUpdate).length > 0) {
    const { error: upsertErr } = await adminSb
      .from('users')
      .upsert({ id: userId, ...profileUpdate })
    if (upsertErr) console.error('Profile upsert failed:', upsertErr)
    else profileUpdated = true
  }

  // Summary: only auto-populate when the user has none saved.
  if (contact.summary && !existing?.summary) {
    const { error: sumErr } = await adminSb
      .from('users')
      .upsert({ id: userId, summary: contact.summary })
    if (sumErr) console.error('Summary upsert failed:', sumErr)
  }

  // Education: only auto-populate on the first upload (when there are no existing entries).
  if (Array.isArray(contact.education) && contact.education.length > 0) {
    const { count: existingEduCount } = await adminSb
      .from('education')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    if ((existingEduCount ?? 0) === 0) {
      const rows = contact.education.map((e, i) => ({
        user_id: userId,
        school: e.school,
        degree: e.degree,
        field:  e.field,
        year:   e.year,
        sort_order: i,
      }))
      const { error: eduErr } = await adminSb.from('education').insert(rows)
      if (eduErr) console.error('Education insert failed:', eduErr)
    }
  }

  return profileUpdated
}

function ndjsonLine(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + '\n')
}

export async function POST(req: Request) {
  let supabase = await createClient()
  let { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const authedClient = createAnonClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      )
      const { data } = await authedClient.auth.getUser()
      user = data.user
      if (user) supabase = authedClient as ReturnType<typeof createAnonClient>
    }
  }

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = await checkAndLog(supabase, user.id, 'rl_parse_resume', 10, 3600)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
  }

  const { raw_text, resume_id } = await req.json()
  if (typeof raw_text !== 'string' || !raw_text || !isUuid(resume_id)) {
    return NextResponse.json({ error: 'Missing or invalid raw_text or resume_id' }, { status: 400 })
  }
  if (raw_text.length > 200_000) {
    return NextResponse.json({ error: 'Resume too long (max 200,000 chars)' }, { status: 400 })
  }

  const profileId = await getActiveProfileId(supabase, user.id)

  // Kept for callers not yet updated to NDJSON (business reparse, admin reparse) — same
  // single-JSON-response shape as before.
  const jsonMode = new URL(req.url).searchParams.get('mode') === 'json'
  if (jsonMode) {
    try {
      const { modules: insertedModules, contact, jobSyncError, jobExperienceIds } = await parseModules(supabase, user.id, resume_id, raw_text, profileId)
      const adminSb = await createAdminClient()
      const profileUpdated = await applyContactSideEffects(adminSb, user.id, user.email, contact)
      await supabase.from('usage_events').insert({ user_id: user.id, action: 'upload_resume' })
      return NextResponse.json({ resume_id, modules: insertedModules, module_count: insertedModules.length, contact, profileUpdated, job_experience_ids: jobExperienceIds ?? [], ...(jobSyncError && { job_sync_error: jobSyncError }) })
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Request failed' }, { status: 500 })
    }
  }

  const authedUser = user
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { modules: insertedModules, contact, jobSyncError, jobExperienceIds } = await parseModules(
          supabase, authedUser.id, resume_id, raw_text, profileId,
          (event: ParseProgressEvent) => controller.enqueue(ndjsonLine(event))
        )

        const adminSb = await createAdminClient()
        const profileUpdated = await applyContactSideEffects(adminSb, authedUser.id, authedUser.email, contact)
        await supabase.from('usage_events').insert({ user_id: authedUser.id, action: 'upload_resume' })

        controller.enqueue(ndjsonLine({
          type: 'done',
          module_count: insertedModules.length,
          modules: insertedModules,
          contact,
          resume_id,
          profile_updated: profileUpdated,
          job_experience_ids: jobExperienceIds ?? [],
          ...(jobSyncError && { job_sync_error: jobSyncError }),
        }))
      } catch (error) {
        console.error('[parse-resume]', error)
        controller.enqueue(ndjsonLine({ type: 'error' }))
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  })
}
