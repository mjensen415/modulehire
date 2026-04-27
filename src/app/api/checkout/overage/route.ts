import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('plan, stripe_customer_id, email, name')
      .eq('id', user.id)
      .single()

    const plan = profile?.plan ?? 'free'
    if (plan !== 'free') {
      return NextResponse.json({ error: 'Overage credits are only for the free plan.' }, { status: 400 })
    }

    const priceId = process.env.STRIPE_PRICE_RESUME_OVERAGE
    if (!priceId) {
      console.error('[api/checkout/overage] STRIPE_PRICE_RESUME_OVERAGE is not configured')
      return NextResponse.json({ error: 'Overage purchase is not available right now.' }, { status: 500 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      console.error('[api/checkout/overage] NEXT_PUBLIC_APP_URL is not configured')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

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
        console.error('[api/checkout/overage] failed to persist stripe_customer_id:', saveError)
        // Continue — checkout will still work, but the webhook may need to reconcile.
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/generate?overage_success=true`,
      cancel_url:  `${appUrl}/generate`,
      metadata: {
        supabase_user_id: user.id,
        type: 'resume_overage',
      },
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 })
    }
    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('[api/checkout/overage]', error)
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 })
  }
}
