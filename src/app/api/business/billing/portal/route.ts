import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { safeReturnUrl } from '@/lib/safe-return-url'

// Opens the Stripe billing portal for an org's own customer (not the owner's personal
// ModuleHire customer). Uses the account's default portal configuration on purpose:
// STRIPE_PORTAL_CONFIG_ID is set up for the job-seeker plans.
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { org_id: orgId } = (await req.json()) as { org_id?: string }
    if (!isUuid(orgId)) return NextResponse.json({ error: 'Invalid org_id' }, { status: 400 })

    const admin = await createAdminClient()
    const { data: org } = await admin
      .from('organizations')
      .select('owner_id, stripe_customer_id')
      .eq('id', orgId)
      .single()
    if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (org.owner_id !== user.id) {
      return NextResponse.json({ error: 'Only the organization owner can manage billing.' }, { status: 403 })
    }
    if (!org.stripe_customer_id) {
      return NextResponse.json({ error: 'No billing account for this organization yet.' }, { status: 404 })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: safeReturnUrl(req, '/business/settings', '/business/settings'),
    })
    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('[api/business/billing/portal]', error)
    return NextResponse.json({ error: 'Could not open billing portal.' }, { status: 500 })
  }
}
