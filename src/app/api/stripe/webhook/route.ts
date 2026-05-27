import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/validate';
import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type SkuKey = 'pro_monthly' | 'pro_annual' | 'single' | 'five_pack';

const SKU_CREDITS: Partial<Record<SkuKey, number>> = {
  single: 1,
  five_pack: 5,
};

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
    priceId === process.env.STRIPE_STANDARD_PRICE_ID
  ) return 'starter';
  return 'free';
}

function metadataUserId(meta: Stripe.Metadata | null | undefined): string | null {
  const raw = meta?.supabase_user_id ?? meta?.user_id;
  return typeof raw === 'string' && isUuid(raw) ? raw : null;
}

async function resolveUserIdFromSession(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const fromRef = session.client_reference_id && isUuid(session.client_reference_id)
    ? session.client_reference_id
    : null;
  if (fromRef) return fromRef;

  const fromMeta = metadataUserId(session.metadata);
  if (fromMeta) return fromMeta;

  const email = session.customer_email ?? (session.customer_details?.email ?? null);
  if (email) {
    const { data } = await supabase.from('users').select('id').eq('email', email.toLowerCase()).maybeSingle();
    if (data?.id) return data.id as string;
  }

  if (session.customer && typeof session.customer === 'string') {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('stripe_customer_id', session.customer)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  return null;
}

async function resolveUserIdFromSubscription(
  supabase: SupabaseClient,
  sub: Stripe.Subscription,
): Promise<string | null> {
  const fromMeta = metadataUserId(sub.metadata);
  if (fromMeta) return fromMeta;

  if (typeof sub.customer === 'string') {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('stripe_customer_id', sub.customer)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

async function getCurrentTier(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from('users').select('tier').eq('id', userId).single();
  return (data?.tier as string) ?? null;
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

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = await resolveUserIdFromSession(supabase, session);

      if (!userId) {
        console.error('[stripe webhook] could not resolve user id for session', session.id);
        return NextResponse.json({ ok: true });
      }

      // Backfill stripe_customer_id whenever we have one.
      if (session.customer && typeof session.customer === 'string') {
        const { data: existing } = await supabase
          .from('users')
          .select('stripe_customer_id')
          .eq('id', userId)
          .single();
        if (!existing?.stripe_customer_id) {
          await supabase
            .from('users')
            .update({ stripe_customer_id: session.customer })
            .eq('id', userId);
        }
      }

      // ── One-time purchases ─────────────────────────────────────────────────
      if (session.mode === 'payment') {
        const sku = session.metadata?.sku as SkuKey | undefined;
        const credits = sku ? SKU_CREDITS[sku] : undefined;

        if (credits) {
          const { error } = await supabase.rpc('increment_generations_remaining', {
            p_user_id: userId,
            p_amount: credits,
          });
          if (error) console.error('[stripe webhook] increment_generations_remaining failed:', error);
        } else {
          // Legacy path — older checkouts encoded credits via metadata.type/credits
          // and incremented the deprecated resume_credits column. Still honour
          // those so in-flight purchases don't get dropped.
          const legacyType = session.metadata?.type;
          const legacyCredits = parseInt(session.metadata?.credits ?? '0', 10);
          if ((legacyType === 'resume_single' || legacyType === 'resume_pack') && legacyCredits > 0) {
            const { error } = await supabase.rpc('increment_resume_credits', {
              p_user_id: userId,
              p_amount: legacyCredits,
            });
            if (error) console.error('[stripe webhook] legacy increment_resume_credits failed:', error);
          }
        }
        return NextResponse.json({ ok: true });
      }

      // ── Subscription purchases ─────────────────────────────────────────────
      if (session.mode === 'subscription' && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const periodEnd = new Date(
          (subscription as unknown as { current_period_end: number }).current_period_end * 1000,
        ).toISOString();
        const priceId = subscription.items.data[0]?.price.id;
        const plan = planFromPriceId(priceId);

        await supabase
          .from('users')
          .update({
            tier: 'pro',
            plan,
            stripe_subscription_id: subscription.id,
            plan_period_end: periodEnd,
          })
          .eq('id', userId);
      }

      return NextResponse.json({ ok: true });
    }

    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = await resolveUserIdFromSubscription(supabase, subscription);
      if (!userId) {
        console.error('[stripe webhook] subscription.updated: user not resolved', subscription.id);
        return NextResponse.json({ ok: true });
      }

      const priceId = subscription.items.data[0]?.price.id;
      const plan = planFromPriceId(priceId);
      const periodEnd = new Date(
        (subscription as unknown as { current_period_end: number }).current_period_end * 1000,
      ).toISOString();
      const currentTier = await getCurrentTier(supabase, userId);

      const update: Record<string, unknown> = {
        plan,
        plan_period_end: periodEnd,
        stripe_subscription_id: subscription.id,
      };

      if (subscription.status === 'active') {
        // Promote, but never demote beta_pro on an upgrade event.
        if (currentTier !== 'beta_pro') update.tier = 'pro';
      } else if (
        subscription.status === 'canceled' ||
        subscription.status === 'past_due' ||
        subscription.status === 'unpaid'
      ) {
        // Only downgrade if they were the paying tier. Leave beta_pro / free alone.
        if (currentTier === 'pro') update.tier = 'free';
      }

      await supabase.from('users').update(update).eq('id', userId);
      return NextResponse.json({ ok: true });
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = await resolveUserIdFromSubscription(supabase, subscription);
      if (!userId) {
        console.error('[stripe webhook] subscription.deleted: user not resolved', subscription.id);
        return NextResponse.json({ ok: true });
      }
      const currentTier = await getCurrentTier(supabase, userId);

      const update: Record<string, unknown> = {
        plan_period_end: null,
        stripe_subscription_id: null,
      };
      // Never downgrade beta_pro automatically.
      if (currentTier === 'pro') {
        update.tier = 'free';
        update.plan = 'free';
      }

      await supabase.from('users').update(update).eq('id', userId);
      return NextResponse.json({ ok: true });
    }
  } catch (err) {
    // Log but return 200 — returning non-2xx makes Stripe retry forever.
    console.error('[stripe webhook] handler error', event.type, err);
  }

  return NextResponse.json({ ok: true });
}
