import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Only return assignments where the module belongs to this user.
    const { data, error } = await supabase
      .from('module_job_assignments')
      .select('module_id, job_id, modules!inner(user_id)')
      .eq('modules.user_id', user.id)

    if (error) throw error
    return NextResponse.json({
      assignments: (data ?? []).map(a => ({ module_id: a.module_id, job_id: a.job_id })),
    })
  } catch (e) {
    console.error('[module-job-assignments GET]', e)
    return NextResponse.json({ error: 'Could not load assignments.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { module_id, job_id } = await req.json()
    if (!module_id || !job_id) return NextResponse.json({ error: 'module_id and job_id required.' }, { status: 400 })

    // Verify both job AND module belong to this user
    const [jobRes, modRes] = await Promise.all([
      supabase.from('job_experiences').select('id').eq('id', job_id).eq('user_id', user.id).single(),
      supabase.from('modules').select('id').eq('id', module_id).eq('user_id', user.id).single(),
    ])
    if (!jobRes.data || !modRes.data) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    const { error } = await supabase.from('module_job_assignments').upsert({ module_id, job_id })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[module-job-assignments POST]', e)
    return NextResponse.json({ error: 'Could not save assignment.' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { module_id, job_id } = await req.json()
    if (!module_id || !job_id) return NextResponse.json({ error: 'module_id and job_id required.' }, { status: 400 })

    // Verify ownership before delete (RLS should also enforce, but make it explicit)
    const [jobRes, modRes] = await Promise.all([
      supabase.from('job_experiences').select('id').eq('id', job_id).eq('user_id', user.id).single(),
      supabase.from('modules').select('id').eq('id', module_id).eq('user_id', user.id).single(),
    ])
    if (!jobRes.data || !modRes.data) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    const { error } = await supabase
      .from('module_job_assignments')
      .delete()
      .eq('module_id', module_id)
      .eq('job_id', job_id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[module-job-assignments DELETE]', e)
    return NextResponse.json({ error: 'Could not delete assignment.' }, { status: 500 })
  }
}
