import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Only return assignments where the skill belongs to this user.
    // RLS should already enforce this, but the server-side filter makes it explicit.
    const { data, error } = await supabase
      .from('skill_module_assignments')
      .select('skill_id, module_id, job_skills!inner(user_id)')
      .eq('job_skills.user_id', user.id)

    if (error) throw error
    return NextResponse.json({
      assignments: (data ?? []).map(a => ({ skill_id: a.skill_id, module_id: a.module_id })),
    })
  } catch (e) {
    console.error('[skill-module-assignments GET]', e)
    return NextResponse.json({ error: 'Could not load assignments.' }, { status: 500 })
  }
}

async function verifyOwnership(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, skillId: string, moduleId: string): Promise<boolean> {
  const [skillRes, modRes] = await Promise.all([
    supabase.from('job_skills').select('id').eq('id', skillId).eq('user_id', userId).single(),
    supabase.from('modules').select('id').eq('id', moduleId).eq('user_id', userId).single(),
  ])
  return !!skillRes.data && !!modRes.data
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { skill_id, module_id } = await req.json()
    if (!skill_id || !module_id) return NextResponse.json({ error: 'skill_id and module_id required.' }, { status: 400 })

    if (!(await verifyOwnership(supabase, user.id, skill_id, module_id))) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }

    const { error } = await supabase.from('skill_module_assignments').upsert({ skill_id, module_id })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[skill-module-assignments POST]', e)
    return NextResponse.json({ error: 'Could not save assignment.' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { skill_id, module_id } = await req.json()
    if (!skill_id || !module_id) return NextResponse.json({ error: 'skill_id and module_id required.' }, { status: 400 })

    if (!(await verifyOwnership(supabase, user.id, skill_id, module_id))) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }

    const { error } = await supabase
      .from('skill_module_assignments')
      .delete()
      .eq('skill_id', skill_id)
      .eq('module_id', module_id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[skill-module-assignments DELETE]', e)
    return NextResponse.json({ error: 'Could not delete assignment.' }, { status: 500 })
  }
}
