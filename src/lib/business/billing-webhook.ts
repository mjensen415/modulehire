import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { isUuid } from '@/lib/validate'

// Business (org) subscriptions are tagged metadata.kind = 'business' by
// /api/business/billing/checkout. The Stripe webhook calls this first; when it returns
// true the event was a business one and the classic user-plan handling must not run
// (it would otherwise give the buyer personal Pro for an org purchase).

function isBusiness(meta: Stripe.Metadata | null | undefined): boolean {
  return meta?.kind === 'business'
}

function orgIdFrom(meta: Stripe.Metadata | null | undefined): string | null {
  const raw = meta?.org_id
  return typeof raw === 'string' && isUuid(raw) ? raw : null
}

function isTeamPrice(priceId: string | undefined): boolean {
  return !!priceId && priceId === process.env.STRIPE_PRICE_BUSINESS_TEAM
}

async function setOrgTier(
  supabase: SupabaseClient,
  orgId: string,
  next: 'growth' | 'starter',
  customerId: string | null,
) {
  const { data: org } = await supabase.from('organizations').select('tier, stripe_customer_id').eq('id', orgId).single()
  if (!org) {
    console.error('[stripe webhook][business] org not found', orgId)
    return
  }
  const update: Record<string, unknown> = {}
  // enterprise is granted by hand; never move it up or down from billing events.
  if (org.tier !== 'enterprise') {
    if (next === 'growth') update.tier = 'growth'
    else if (org.tier === 'growth') update.tier = 'starter'
  }
  if (customerId && !org.stripe_customer_id) update.stripe_customer_id = customerId
  if (Object.keys(update).length === 0) return
  const { error } = await supabase.from('organizations').update(update).eq('id', orgId)
  if (error) console.error('[stripe webhook][business] org update failed', orgId, error)
}

function subscriptionGrants(sub: Stripe.Subscription): boolean {
  const priceId = sub.items.data[0]?.price.id
  return isTeamPrice(priceId) && (sub.status === 'active' || sub.status === 'trialing')
}

export async function handleBusinessEvent(event: Stripe.Event, supabase: SupabaseClient): Promise<boolean> {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (!isBusiness(session.metadata)) return false
    const orgId = orgIdFrom(session.metadata)
    const customerId = typeof session.customer === 'string' ? session.customer : null
    if (!orgId || session.mode !== 'subscription' || typeof session.subscription !== 'string') {
      console.error('[stripe webhook][business] unusable checkout session', session.id)
      return true
    }
    const sub = await stripe.subscriptions.retrieve(session.subscription)
    await setOrgTier(supabase, orgId, subscriptionGrants(sub) ? 'growth' : 'starter', customerId)
    return true
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    if (!isBusiness(sub.metadata)) return false
    const orgId = orgIdFrom(sub.metadata)
    if (!orgId) {
      console.error('[stripe webhook][business] subscription without org_id', sub.id)
      return true
    }
    const customerId = typeof sub.customer === 'string' ? sub.customer : null
    const grants = event.type === 'customer.subscription.updated' && subscriptionGrants(sub)
    // incomplete (first payment pending) changes nothing; anything else that doesn't grant downgrades.
    if (event.type === 'customer.subscription.updated' && sub.status === 'incomplete') return true
    await setOrgTier(supabase, orgId, grants ? 'growth' : 'starter', customerId)
    return true
  }

  return false
}
