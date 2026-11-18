import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { safeReturnUrl } from '@/lib/safe-return-url'
import { SPRINT_SKUS, isSprintSku } from '@/lib/sprint'

// One-time Sprint checkout (mode: payment, never a subscription). The webhook applies it.
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { sku, returnUrl } = await req.json().catch(() => ({})) as { sku?: string; returnUrl?: string }
    if (!isSprintSku(sku)) return NextResponse.json({ error: 'Choose a 30-day or 90-day Sprint.' }, { status: 400 })
    const priceId = process.env[SPRINT_SKUS[sku].priceEnv]
    if (!priceId) {
      console.error(`[api/billing/checkout] ${SPRINT_SKUS[sku].priceEnv} is not set`)
      return NextResponse.json({ error: 'Checkout is not available right now.' }, { status: 503 })
    }

    const safe = safeReturnUrl(req, returnUrl, '/billing')
    const successUrl = new URL(safe)
    successUrl.searchParams.set('sprint', 'started')

    const admin = await createAdminClient()
    const { data: profile } = await admin.from('users').select('stripe_customer_id, email').eq('id', user.id).single()

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      ...(profile?.stripe_customer_id
        ? { customer: profile.stripe_customer_id }
        : { customer_email: profile?.email ?? user.email ?? undefined, customer_creation: 'always' as const }),
      success_url: successUrl.toString(),
      cancel_url: safe,
      metadata: { supabase_user_id: user.id, sku },
      payment_intent_data: { metadata: { supabase_user_id: user.id, sku } },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('[api/billing/checkout]', error)
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 })
  }
}
