import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { safeReturnUrl } from '@/lib/safe-return-url'

type SkuKey = 'pro_monthly' | 'pro_annual' | 'single' | 'five_pack'

const SKU_TO_PRICE: Record<SkuKey, string | undefined> = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
  pro_annual: process.env.STRIPE_PRICE_PRO_ANNUAL,
  single: process.env.STRIPE_PRICE_SINGLE,
  five_pack: process.env.STRIPE_PRICE_5PACK,
}

const SUBSCRIPTION_SKUS: Set<SkuKey> = new Set(['pro_monthly', 'pro_annual'])

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { sku, returnUrl } = await req.json() as { sku?: string; returnUrl?: string }
    if (!sku || !(sku in SKU_TO_PRICE)) {
      return NextResponse.json({ error: 'Invalid sku' }, { status: 400 })
    }
    const priceId = SKU_TO_PRICE[sku as SkuKey]
    if (!priceId) {
      return NextResponse.json({ error: 'Price not configured. Set the Stripe env var for this SKU.' }, { status: 503 })
    }

    const safe = safeReturnUrl(req, returnUrl, '/billing')
    const successUrl = new URL(safe)
    successUrl.searchParams.set('upgraded', '1')

    // Use existing customer if we have one; otherwise let Stripe create + we'll
    // backfill stripe_customer_id from the webhook.
    const admin = await createAdminClient()
    const { data: profile } = await admin
      .from('users')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single()

    const mode = SUBSCRIPTION_SKUS.has(sku as SkuKey) ? 'subscription' : 'payment'

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      ...(profile?.stripe_customer_id
        ? { customer: profile.stripe_customer_id }
        : { customer_email: profile?.email ?? user.email ?? undefined }),
      success_url: successUrl.toString(),
      cancel_url: safe,
      metadata: { supabase_user_id: user.id, sku },
      ...(mode === 'subscription'
        ? { subscription_data: { metadata: { supabase_user_id: user.id, sku } } }
        : {}),
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('[api/billing/checkout]', error)
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 })
  }
}
