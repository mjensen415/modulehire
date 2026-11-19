import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { safeReturnUrl } from '@/lib/safe-return-url'

// Starts a Stripe Checkout subscription for the Business Team plan. Owner only.
// The webhook recognizes it by metadata.kind = 'business' and sets organizations.tier
// (service role); it never touches the user's own classic plan or tier.
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { org_id: orgId } = (await req.json()) as { org_id?: string }
    if (!isUuid(orgId)) return NextResponse.json({ error: 'Invalid org_id' }, { status: 400 })

    const priceId = process.env.STRIPE_PRICE_BUSINESS_TEAM
    if (!priceId) return NextResponse.json({ error: 'Business pricing is not configured yet.' }, { status: 503 })

    const admin = await createAdminClient()
    const { data: org } = await admin
      .from('organizations')
      .select('id, name, owner_id, tier, stripe_customer_id')
      .eq('id', orgId)
      .single()
    if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (org.owner_id !== user.id) {
      return NextResponse.json({ error: 'Only the organization owner can change the plan.' }, { status: 403 })
    }
    if (org.tier === 'growth' || org.tier === 'enterprise') {
      return NextResponse.json({ error: 'This organization is already on a paid plan.' }, { status: 409 })
    }

    const settings = safeReturnUrl(req, '/business/settings', '/business/settings')
    const success = new URL(settings)
    success.searchParams.set('upgraded', '1')

    const metadata = { kind: 'business', org_id: org.id, supabase_user_id: user.id }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: org.id,
      ...(org.stripe_customer_id
        ? { customer: org.stripe_customer_id }
        : { customer_email: user.email ?? undefined }),
      allow_promotion_codes: true,
      success_url: success.toString(),
      cancel_url: settings,
      metadata,
      subscription_data: { metadata, description: `ModuleHire for Business: ${org.name}` },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('[api/business/billing/checkout]', error)
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 })
  }
}
