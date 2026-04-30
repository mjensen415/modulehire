import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, context } = await req.json()
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }

  const adminClient = await createAdminClient()

  // Check for duplicate
  const { data: existing } = await adminClient
    .from('beta_requests')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .limit(1)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'This email is already on the list' }, { status: 409 })
  }

  const { data, error } = await adminClient
    .from('beta_requests')
    .insert({
      email: email.toLowerCase().trim(),
      context: context?.trim() || null,
      marketing_opt_in: false,
      status: 'pending',
    })
    .select('id, email, context, marketing_opt_in, created_at, status, beta_code, invited_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ request: data })
}
