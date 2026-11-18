import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveProfileId } from '@/lib/profile'
import { isUuid } from '@/lib/validate'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { resume_id, modules, discarded_ids } = await req.json()
    if (Array.isArray(discarded_ids) && discarded_ids.length > 0) {
      await supabase
        .from('modules')
        .update({ status: 'rejected', deleted_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('status', 'draft')
        .in('id', discarded_ids.filter(isUuid).slice(0, 500))
    }
    if (!Array.isArray(modules) || modules.length === 0) {
      return NextResponse.json({ error: 'No modules provided' }, { status: 400 })
    }

    const profileId = await getActiveProfileId(supabase, user.id)

    // Separate existing modules (have real UUIDs) from new ones (id is undefined/null)
    const toUpsert = modules.map((m: Record<string, unknown>) => {
      const { id, ...rest } = m
      const base = {
        ...rest,
        user_id: user.id,
        profile_id: profileId,
        source_resume_id: resume_id ?? null,
        // Module review after upload: saving what the user kept confirms it.
        status: 'confirmed',
      }
      // Only include id if it's a real UUID (not a temp "new-N" id)
      if (id && typeof id === 'string' && !id.startsWith('new-')) {
        return { ...base, id }
      }
      return base
    })

    const { data: saved, error: saveError } = await supabase
      .from('modules')
      .upsert(toUpsert, { onConflict: 'id' })
      .select()

    if (saveError) throw saveError

    // Mark resume as parsed
    if (resume_id) {
      await supabase
        .from('resumes')
        .update({ parsed_at: new Date().toISOString() })
        .eq('id', resume_id)
        .eq('user_id', user.id)
    }

    // Record usage event
    await supabase.from('usage_events').insert({ user_id: user.id, action: 'upload_resume' })

    return NextResponse.json({ saved: saved?.length ?? 0 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
