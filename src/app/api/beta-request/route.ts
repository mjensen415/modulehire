import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkAndLogKey } from '@/lib/rate-limit'

export async function POST(req: Request) {
  try {
    // Durable per-IP throttle (P1.4): 5 requests / hour backed by the
    // rate_limits table. Replaces the old in-memory Map, which was per-instance
    // and reset on every serverless cold start — effectively no limit on Vercel.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const supabase = await createAdminClient()
    const throttled = await checkAndLogKey(supabase, ip, 'rl_beta_request', 5, 3600)
    if (!throttled.ok) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(throttled.retryAfter) } },
      )
    }

    const { email, context, marketing_opt_in } = await req.json()

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required.' }, { status: 400 })
    }

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
    console.error('[beta-request/route.ts]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
