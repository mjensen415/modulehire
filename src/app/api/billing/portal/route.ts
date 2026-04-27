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
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    const customerId = profile?.stripe_customer_id as string | null | undefined
    if (!customerId) {
      return NextResponse.json({ error: 'No billing account found.' }, { status: 404 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      console.error('[api/billing/portal] NEXT_PUBLIC_APP_URL is not configured')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/settings`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('[api/billing/portal]', error)
    return NextResponse.json({ error: 'Could not open billing portal.' }, { status: 500 })
  }
}
