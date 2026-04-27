import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const { email, context, marketing_opt_in } = await req.json()

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required.' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // Check for duplicate
    const { data: existing } = await supabase
      .from('beta_requests')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .limit(1)
      .single()

    if (existing) {
      // Silently succeed — don't leak whether an email is registered
      return NextResponse.json({ success: true })
    }

    const { error } = await supabase.from('beta_requests').insert({
      email: email.toLowerCase().trim(),
      context: context?.trim() || null,
      marketing_opt_in: !!marketing_opt_in,
    })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
