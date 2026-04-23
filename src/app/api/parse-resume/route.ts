import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { parseModules } from '@/lib/parse-modules'

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

    const { raw_text, resume_id } = await req.json()
    if (!raw_text || !resume_id) {
      return NextResponse.json({ error: 'Missing raw_text or resume_id' }, { status: 400 })
    }

    const { modules: insertedModules, contact } = await parseModules(supabase, user.id, resume_id, raw_text)

    // Store contact info on user profile — only fill null fields, never overwrite
    if (contact) {
      const { data: existing } = await supabase
        .from('users')
        .select('name, phone, linkedin_url, location')
        .eq('id', user.id)
        .single()

      const profileUpdate: Record<string, string> = {}
      if (!existing?.name && contact.full_name) profileUpdate.name = contact.full_name
      if (!existing?.phone && contact.phone) profileUpdate.phone = contact.phone
      if (!existing?.linkedin_url && contact.linkedin_url) profileUpdate.linkedin_url = contact.linkedin_url
      if (!existing?.location && contact.location) profileUpdate.location = contact.location

      if (Object.keys(profileUpdate).length > 0) {
        await supabase.from('users').update(profileUpdate).eq('id', user.id)
      }
    }

    await supabase.from('usage_events').insert({ user_id: user.id, action: 'upload_resume' })

    return NextResponse.json({ resume_id, modules: insertedModules, module_count: insertedModules.length, contact })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
