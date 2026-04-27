import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { parseModules } from '@/lib/parse-modules'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid } from '@/lib/validate'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
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

    const { modules: insertedModules, contact, jobSyncError } = await parseModules(supabase, user.id, resume_id, raw_text)

    const adminSb = await createAdminClient()
    let profileUpdated = false

    if (contact) {
      // Fetch existing profile to decide: auto-apply (empty profile) or let the client prompt
      const { data: existing } = await adminSb
        .from('users')
        .select('name, email')
        .eq('id', user.id)
        .single()

      const emailPrefix = (existing?.email ?? user.email ?? '').split('@')[0]
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
          .upsert({ id: user.id, ...profileUpdate })
        if (upsertErr) console.error('Profile upsert failed:', upsertErr)
        else profileUpdated = true
      }
    }

    await supabase.from('usage_events').insert({ user_id: user.id, action: 'upload_resume' })

    return NextResponse.json({ resume_id, modules: insertedModules, module_count: insertedModules.length, contact, profileUpdated, ...(jobSyncError && { job_sync_error: jobSyncError }) })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
