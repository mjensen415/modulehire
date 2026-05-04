import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// Basic in-memory rate limiter (per-instance)
const rateLimit = new Map<string, { count: number, timestamp: number }>()

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const now = Date.now()
    const windowMs = 60 * 1000 // 1 minute
    const limit = 5 // 5 requests per minute

    const current = rateLimit.get(ip)
    if (current && (now - current.timestamp < windowMs)) {
      if (current.count >= limit) {
        return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
      }
      current.count++
    } else {
      rateLimit.set(ip, { count: 1, timestamp: now })
    }

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
    console.error('[beta-request/route.ts]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
