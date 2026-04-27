import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const job_id = searchParams.get('job_id')

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let query = supabase.from('job_skills').select('*').eq('user_id', user.id).order('created_at')
    if (job_id) query = query.eq('job_id', job_id)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ skills: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { job_id, name } = await req.json()
    if (!job_id || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'job_id and name required.' }, { status: 400 })
    }
    const trimmedName = name.trim()
    if (trimmedName.length > 100) {
      return NextResponse.json({ error: 'Skill name too long (max 100).' }, { status: 400 })
    }

    // Verify the job belongs to this user before attaching skills to it
    const { data: job } = await supabase
      .from('job_experiences')
      .select('id')
      .eq('id', job_id)
      .eq('user_id', user.id)
      .single()
    if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })

    const { data, error } = await supabase
      .from('job_skills')
      .insert({ job_id, user_id: user.id, name: trimmedName })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ skill: data })
  } catch (e) {
    console.error('[job-skills POST]', e)
    return NextResponse.json({ error: 'Could not save skill.' }, { status: 500 })
  }
}
