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

    const insertedModules = await parseModules(supabase, user.id, resume_id, raw_text)

    await supabase.from('usage_events').insert({ user_id: user.id, action: 'upload_resume' })

    return NextResponse.json({ resume_id, modules: insertedModules, module_count: insertedModules.length })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
