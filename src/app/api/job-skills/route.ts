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
    if (!job_id || !name?.trim()) return NextResponse.json({ error: 'job_id and name required.' }, { status: 400 })

    const { data, error } = await supabase
      .from('job_skills')
      .insert({ job_id, user_id: user.id, name: name.trim() })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ skill: data })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
