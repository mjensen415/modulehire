import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';
import { safeReturnUrl } from '@/lib/safe-return-url';

const PRICE_IDS: Record<string, string | undefined> = {
  // STRIPE_STARTER_PRICE_ID is the new env var; fall back to the legacy name during migration.
  starter: process.env.STRIPE_STARTER_PRICE_ID ?? process.env.STRIPE_STANDARD_PRICE_ID,
  pro: process.env.STRIPE_PRO_PRICE_ID,
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { plan, returnUrl } = await req.json();
    const priceId = PRICE_IDS[plan];
    if (!priceId) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });

    const safe = safeReturnUrl(req, returnUrl, '/billing');
    const successUrl = new URL(safe);
    successUrl.searchParams.set('upgraded', '1');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email,
      success_url: successUrl.toString(),
      cancel_url: safe,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[stripe/checkout]', error);
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
  }
}
