import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/validate';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

function planFromPriceId(priceId: string | undefined): 'free' | 'starter' | 'pro' {
  if (!priceId) return 'free';
  if (
    priceId === process.env.STRIPE_PRICE_PRO_MONTHLY ||
    priceId === process.env.STRIPE_PRICE_PRO_ANNUAL ||
    priceId === process.env.STRIPE_PRO_PRICE_ID
  ) return 'pro';
  if (
    priceId === process.env.STRIPE_PRICE_STARTER_MONTHLY ||
    priceId === process.env.STRIPE_PRICE_STARTER_ANNUAL ||
    priceId === process.env.STRIPE_STARTER_PRICE_ID ||
    // legacy env name during migration
    priceId === process.env.STRIPE_STANDARD_PRICE_ID
  ) return 'starter';
  return 'free';
}

function userIdFromSubscriptionMetadata(sub: Stripe.Subscription): string | null {
  const raw = sub.metadata?.supabase_user_id;
  return typeof raw === 'string' && isUuid(raw) ? raw : null;
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return NextResponse.json({ error: `Webhook error: ${(err as Error).message}` }, { status: 400 });
  }

  const supabase = await createAdminClient();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // One-time overage purchase (free plan resume credit) — payment mode, no subscription
    if (session.mode === 'payment' && session.metadata?.type === 'resume_overage') {
      const userId = session.metadata?.supabase_user_id;
      if (!userId || !isUuid(userId)) {
        console.error('[stripe webhook] overage session missing/invalid supabase_user_id:', session.id);
        return NextResponse.json({ ok: true });
      }
      const now = new Date();
      const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const { error: rpcError } = await supabase.rpc('increment_overage_credits', {
        p_user_id: userId,
        p_month: month,
      });
      if (rpcError) {
        // Log but do NOT return non-200 — Stripe would retry indefinitely.
        console.error('[stripe webhook] increment_overage_credits failed:', rpcError);
      }
      return NextResponse.json({ ok: true });
    }

    if (!session.subscription || !session.customer) return NextResponse.json({ ok: true });

    const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
    // Prefer the subscription metadata user id (set by /api/checkout); fall back to legacy client_reference_id.
    const userId = userIdFromSubscriptionMetadata(subscription) ?? session.client_reference_id ?? null;
    if (!userId || !isUuid(userId)) {
      console.error('[stripe webhook] could not resolve user id for session:', session.id);
      return NextResponse.json({ ok: true });
    }

    // Verify the user actually exists before mutating their plan
    const { data: existingUser } = await supabase.from('users').select('id').eq('id', userId).single();
    if (!existingUser) {
      console.error('[stripe webhook] user not found:', userId);
      return NextResponse.json({ ok: true });
    }

    const periodEnd = new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString();
    const priceId = subscription.items.data[0]?.price.id;
    const plan = planFromPriceId(priceId);

    await supabase.from('users').update({
      plan,
      stripe_customer_id: session.customer as string,
      stripe_subscription_id: session.subscription as string,
      plan_period_end: periodEnd,
    }).eq('id', userId);
  }

  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription;
    const priceId = subscription.items.data[0]?.price.id;
    const plan = planFromPriceId(priceId);
    const periodEnd = new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString();

    // Prefer metadata.supabase_user_id; fall back to looking up by stripe_subscription_id.
    const userId = userIdFromSubscriptionMetadata(subscription);
    const query = supabase.from('users').update({ plan, plan_period_end: periodEnd });
    await (userId ? query.eq('id', userId) : query.eq('stripe_subscription_id', subscription.id));
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;

    const userId = userIdFromSubscriptionMetadata(subscription);
    const query = supabase.from('users').update({
      plan: 'free',
      stripe_subscription_id: null,
      plan_period_end: null,
    });
    await (userId ? query.eq('id', userId) : query.eq('stripe_subscription_id', subscription.id));
  }

  return NextResponse.json({ ok: true });
}
