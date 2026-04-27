import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

const PRICE_MAP: Record<string, string | undefined> = {
  'starter-monthly': process.env.STRIPE_PRICE_STARTER_MONTHLY,
  'starter-annual':  process.env.STRIPE_PRICE_STARTER_ANNUAL,
  'pro-monthly':     process.env.STRIPE_PRICE_PRO_MONTHLY,
  'pro-annual':      process.env.STRIPE_PRICE_PRO_ANNUAL,
}

const VALID_PLANS = new Set(['starter', 'pro'])
const VALID_INTERVALS = new Set(['monthly', 'annual'])

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { plan, interval } = await req.json()
    if (!VALID_PLANS.has(plan) || !VALID_INTERVALS.has(interval)) {
      return NextResponse.json({ error: 'Invalid plan or interval' }, { status: 400 })
    }

    const priceId = PRICE_MAP[`${plan}-${interval}`]
    if (!priceId) {
      console.error('[api/checkout] missing price id for', plan, interval)
      return NextResponse.json({ error: 'Plan is not available right now.' }, { status: 500 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      console.error('[api/checkout] NEXT_PUBLIC_APP_URL is not configured')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    // Look up or create the Stripe customer for this user
    const { data: profile } = await supabase
      .from('users')
      .select('stripe_customer_id, name, email')
      .eq('id', user.id)
      .single()

    let customerId = profile?.stripe_customer_id as string | null | undefined
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? user.email ?? undefined,
        name:  profile?.name  ?? undefined,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id

      const { error: saveError } = await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
      if (saveError) {
        console.error('[api/checkout] failed to persist stripe_customer_id:', saveError)
        // Continue — checkout will still work, but the webhook may need to reconcile.
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?upgraded=true`,
      cancel_url:  `${appUrl}/pricing`,
      subscription_data: {
        ...(plan === 'pro' && { trial_period_days: 7 }),
        metadata: {
          supabase_user_id: user.id,
          plan,
          interval,
        },
      },
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 })
    }
    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('[api/checkout]', error)
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 })
  }
}
