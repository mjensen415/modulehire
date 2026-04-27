import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('job_experiences')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ jobs: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { company, title, start_date, end_date, location, employment_type } = body
    if (!company?.trim()) return NextResponse.json({ error: 'Company is required.' }, { status: 400 })

    const { data, error } = await supabase
      .from('job_experiences')
      .insert({ user_id: user.id, company: company.trim(), title, start_date, end_date, location, employment_type })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ job: data })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
