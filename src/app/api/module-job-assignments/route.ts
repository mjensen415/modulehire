import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('module_job_assignments')
      .select('module_id, job_id')

    if (error) throw error
    return NextResponse.json({ assignments: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { module_id, job_id } = await req.json()
    if (!module_id || !job_id) return NextResponse.json({ error: 'module_id and job_id required.' }, { status: 400 })

    // Verify job belongs to user
    const { data: job } = await supabase.from('job_experiences').select('id').eq('id', job_id).eq('user_id', user.id).single()
    if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })

    const { error } = await supabase.from('module_job_assignments').upsert({ module_id, job_id })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { module_id, job_id } = await req.json()

    const { error } = await supabase
      .from('module_job_assignments')
      .delete()
      .eq('module_id', module_id)
      .eq('job_id', job_id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
