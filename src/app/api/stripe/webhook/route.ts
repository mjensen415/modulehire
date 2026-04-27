import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/validate';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

function planFromPriceId(priceId: string | undefined): 'free' | 'standard' | 'pro' {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'pro';
  if (priceId === process.env.STRIPE_STANDARD_PRICE_ID) return 'standard';
  return 'free';
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
    const userId = session.client_reference_id;
    if (!userId || !session.subscription || !session.customer) return NextResponse.json({ ok: true });

    if (!isUuid(userId)) {
      console.error('[stripe webhook] invalid client_reference_id:', userId);
      return NextResponse.json({ ok: true });
    }

    // Verify the user actually exists before mutating their plan
    const { data: existingUser } = await supabase.from('users').select('id').eq('id', userId).single();
    if (!existingUser) {
      console.error('[stripe webhook] user not found for client_reference_id:', userId);
      return NextResponse.json({ ok: true });
    }

    const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
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

    await supabase.from('users').update({ plan, plan_period_end: periodEnd })
      .eq('stripe_subscription_id', subscription.id);
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;

    await supabase.from('users').update({
      plan: 'free',
      stripe_subscription_id: null,
      plan_period_end: null,
    }).eq('stripe_subscription_id', subscription.id);
  }

  return NextResponse.json({ ok: true });
}
