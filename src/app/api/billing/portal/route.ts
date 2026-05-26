import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      console.error('[api/billing/portal] NEXT_PUBLIC_APP_URL is not configured')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const adminClient = await createAdminClient()
    const { data: profile } = await adminClient
      .from('users')
      .select('stripe_customer_id, email, name')
      .eq('id', user.id)
      .single()

    let customerId = profile?.stripe_customer_id as string | null | undefined

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? user.email ?? undefined,
        name: profile?.name ?? undefined,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id

      const { error: updateError } = await adminClient
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)

      if (updateError) {
        console.error('[api/billing/portal] failed to persist stripe_customer_id', updateError)
        return NextResponse.json({ error: 'Could not initialize billing account.' }, { status: 500 })
      }
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/account`,
      ...(process.env.STRIPE_PORTAL_CONFIG_ID
        ? { configuration: process.env.STRIPE_PORTAL_CONFIG_ID }
        : {}),
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('[api/billing/portal]', error)
    return NextResponse.json({ error: 'Could not open billing portal.' }, { status: 500 })
  }
}
