# ModuleHire — Stripe Integration Walkthrough

This covers everything needed to wire up Stripe billing for the three-tier plan (Free / Starter / Pro).

---

## 1. Stripe Dashboard Setup

### Create Products & Prices

In the [Stripe Dashboard](https://dashboard.stripe.com) → Products:

| Product            | Monthly Price ID                     | Annual Price ID        |
| ------------------ | ------------------------------------ | ---------------------- |
| ModuleHire Starter | `price_starter_monthly` (store this) | `price_starter_annual` |
| ModuleHire Pro     | `price_pro_monthly`                  | `price_pro_annual`     |

For each product:
- **Starter Monthly**: $29.00 / month, recurring
- **Starter Annual**: $289.00 / year, recurring
- **Pro Monthly**: $40.00 / month, recurring
- **Pro Annual**: $399.00 / year, recurring

Also create a one-time product for free-tier overages:

| Product                       | Price ID               |
| ----------------------------- | ---------------------- |
| Additional Resume (Free tier) | `price_resume_overage` |

- **Additional Resume**: $4.00, one-time (not recurring). Set the product name to "ModuleHire — Additional Resume" so it shows clearly on receipts.

Copy the `price_xxx` IDs — you'll need them in env vars.

### Get API Keys

Dashboard → Developers → API keys:
- `STRIPE_SECRET_KEY` — secret key (starts with `sk_`)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — publishable key (starts with `pk_`)

### Set Up Webhook

Dashboard → Developers → Webhooks → Add endpoint:
- **URL**: `https://modulehire.com/api/webhooks/stripe`
- **Events to listen for**:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

Copy the **Webhook signing secret** → `STRIPE_WEBHOOK_SECRET`

---

## 2. Environment Variables

Add to `.env.local` (and Vercel project settings):

```bash
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Price IDs from Stripe Dashboard
STRIPE_PRICE_STARTER_MONTHLY=price_1TQyEc9otXBZq9AaOEgeFsvH
STRIPE_PRICE_STARTER_ANNUAL=price_1TQyFR9otXBZq9AaSByGcu5K
STRIPE_PRICE_PRO_MONTHLY=price_1TQyG69otXBZq9Aa0VrG34Sf
STRIPE_PRICE_PRO_ANNUAL=price_1TQyGV9otXBZq9AajMd5XYYp
STRIPE_PRICE_RESUME_OVERAGE=price_1TQyHp9otXBZq9AaNqd4etg2   # $4 one-time, free tier additional resumes
```

---

## 3. Database Changes

Run these migrations in Supabase:

```sql
-- Add Stripe fields to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro')),
  ADD COLUMN IF NOT EXISTS plan_interval text CHECK (plan_interval IN ('monthly', 'annual')),
  ADD COLUMN IF NOT EXISTS plan_current_period_end timestamptz;

-- Track monthly resume generation counts (used for free-tier limit + overage)
CREATE TABLE IF NOT EXISTS public.resume_generation_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  month text NOT NULL,              -- format: 'YYYY-MM', e.g. '2026-04'
  count integer NOT NULL DEFAULT 0,
  UNIQUE(user_id, month)
);
ALTER TABLE public.resume_generation_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON public.resume_generation_counts FOR ALL USING (user_id = auth.uid());

-- Index for webhook lookups
CREATE INDEX IF NOT EXISTS users_stripe_customer_id_idx ON public.users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS users_stripe_subscription_id_idx ON public.users(stripe_subscription_id);
```

---

## 4. Install Stripe SDK

```bash
cd ~/Desktop/codex/projects/modulehire
npm install stripe @stripe/stripe-js
```

---

## 5. Create Stripe Client Helper

Create `src/lib/stripe.ts`:

```ts
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})
```

---

## 6. API Routes to Create

### `POST /api/checkout` — Create Stripe Checkout Session

```ts
// src/app/api/checkout/route.ts
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

const PRICE_MAP: Record<string, string | undefined> = {
  'starter-monthly': process.env.STRIPE_PRICE_STARTER_MONTHLY,
  'starter-annual':  process.env.STRIPE_PRICE_STARTER_ANNUAL,
  'pro-monthly':     process.env.STRIPE_PRICE_PRO_MONTHLY,
  'pro-annual':      process.env.STRIPE_PRICE_PRO_ANNUAL,
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan, interval } = await req.json()  // e.g. plan='pro', interval='monthly'
  const priceId = PRICE_MAP[`${plan}-${interval}`]
  if (!priceId) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

  // Get or create Stripe customer
  const { data: profile } = await supabase.from('users').select('stripe_customer_id, email, name').eq('id', user.id).single()
  
  let customerId = profile?.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email,
      name: profile?.name ?? undefined,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id
    await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id)
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upgraded=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    subscription_data: {
      trial_period_days: plan === 'pro' ? 7 : undefined,
      metadata: { supabase_user_id: user.id, plan, interval },
    },
  })

  return NextResponse.json({ url: session.url })
}
```

### `POST /api/webhooks/stripe` — Handle Stripe Events

```ts
// src/app/api/webhooks/stripe/route.ts
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'  // use admin client — no auth needed

export const config = { api: { bodyParser: false } }

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!
  
  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode !== 'subscription') break
      // Subscription created — the subscription.updated event will fire next and set the plan
      break
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.supabase_user_id
      if (!userId) break

      const plan = event.type === 'customer.subscription.deleted'
        ? 'free'
        : (sub.metadata?.plan ?? 'free')
      const interval = sub.metadata?.interval ?? null
      const periodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null

      await supabase.from('users').update({
        plan,
        plan_interval: interval,
        plan_current_period_end: periodEnd,
        stripe_subscription_id: sub.id,
      }).eq('id', userId)
      break
    }

    case 'invoice.payment_failed': {
      // Optionally: send email, flag account, etc.
      break
    }
  }

  return NextResponse.json({ received: true })
}
```

### `POST /api/billing/portal` — Customer Portal (manage subscription)

```ts
// src/app/api/billing/portal/route.ts
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('stripe_customer_id').eq('id', user.id).single()
  if (!profile?.stripe_customer_id) return NextResponse.json({ error: 'No billing account found' }, { status: 404 })

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
  })

  return NextResponse.json({ url: session.url })
}
```

You'll also need to enable the Customer Portal in the Stripe Dashboard → Settings → Billing → Customer portal.

### `POST /api/checkout/overage` — Free Tier $4 Additional Resume

When a free-tier user hits their 2 resume/month limit and wants to generate another, send them through a one-time $4 Stripe Checkout session. On success, increment their allowance by 1 and unlock generation.

```ts
// src/app/api/checkout/overage/route.ts
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('stripe_customer_id, plan, email, name')
    .eq('id', user.id)
    .single()

  if (profile?.plan !== 'free') {
    return NextResponse.json({ error: 'Overage only applies to free plan' }, { status: 400 })
  }

  // Get or create Stripe customer (same as /api/checkout)
  let customerId = profile?.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email,
      name: profile?.name ?? undefined,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id
    await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id)
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price: process.env.STRIPE_PRICE_RESUME_OVERAGE!,
      quantity: 1,
    }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/generate?overage_success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/generate`,
    metadata: { supabase_user_id: user.id, type: 'resume_overage' },
  })

  return NextResponse.json({ url: session.url })
}
```

**Webhook handler update** — add overage handling inside `checkout.session.completed`:

```ts
case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session

  if (session.mode === 'payment' && session.metadata?.type === 'resume_overage') {
    // Grant 1 additional resume generation for this month
    const userId = session.metadata.supabase_user_id
    const month = new Date().toISOString().slice(0, 7)  // 'YYYY-MM'

    // Upsert count row, then subtract 1 to effectively grant a credit
    // Simplest approach: store paid_overages separately
    await supabase.from('resume_generation_counts')
      .upsert(
        { user_id: userId, month, count: 0 },
        { onConflict: 'user_id,month', ignoreDuplicates: true }
      )
    await supabase.from('resume_generation_counts')
      .update({ count: supabase.rpc('greatest', { a: 0, b: 'count - 1' }) })
      // ↑ Alternatively: just add an `overage_credits` column (see note below)
      .eq('user_id', userId)
      .eq('month', month)
    break
  }

  if (session.mode === 'subscription') break  // handled by subscription.updated
  break
}
```

> **Simpler alternative for overage credits:** Add an `overage_credits integer DEFAULT 0` column to `resume_generation_counts`. When a payment succeeds, increment it by 1. When checking if a user can generate, use `free_limit + overage_credits` as the effective limit. This is cleaner than decrementing the count.
>
> ```sql
> ALTER TABLE public.resume_generation_counts
>   ADD COLUMN IF NOT EXISTS overage_credits integer NOT NULL DEFAULT 0;
> ```

**Frontend: show the overage prompt** — in the generate flow, when a free user hits limit 2, show a modal instead of blocking:

```ts
// When canGenerate() returns false for a free user:
async function handleOverage() {
  const res = await fetch('/api/checkout/overage', { method: 'POST' })
  const data = await res.json()
  if (data.url) window.location.href = data.url
}
```

```tsx
{/* Show when free user is at limit */}
<div className="overage-prompt">
  <p>You&apos;ve used your 2 free resumes this month.</p>
  <p>Generate one more for <strong>$4</strong> — no subscription required.</p>
  <button onClick={handleOverage}>Generate for $4 →</button>
  <Link href="/pricing">Or upgrade for unlimited</Link>
</div>
```

---

## 7. Frontend: Upgrade Button

Wire the "Start for $29/mo" and "Start Pro free for 7 days" buttons on the pricing page to hit `/api/checkout`:

```ts
async function handleUpgrade(plan: 'starter' | 'pro', interval: 'monthly' | 'annual') {
  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, interval }),
  })
  const data = await res.json()
  if (data.url) window.location.href = data.url
}
```

On the pricing page, the buttons become:
```tsx
<button onClick={() => handleUpgrade('pro', 'monthly')}>
  Start Pro free for 7 days
</button>
```

---

## 8. Plan Enforcement

Add a helper to check the user's plan before allowing gated actions:

```ts
// src/lib/plan.ts
export function canGenerate(
  plan: string,
  generationsThisMonth: number,
  overageCredits = 0
): boolean {
  if (plan === 'pro') return true
  if (plan === 'starter') return generationsThisMonth < 15
  // Free: 2 included + any paid overage credits
  return generationsThisMonth < (2 + overageCredits)
}

export function isAtFreeLimit(generationsThisMonth: number, overageCredits = 0): boolean {
  return generationsThisMonth >= (2 + overageCredits)
}

export function moduleLimit(plan: string): number {
  if (plan === 'pro') return Infinity
  if (plan === 'starter') return 50
  return 20
}

export function uploadLimit(plan: string): number {
  if (plan === 'pro') return Infinity
  if (plan === 'starter') return 3
  return 1
}
```

Then in your API routes:
```ts
const { data: profile } = await supabase.from('users').select('plan').eq('id', user.id).single()
if (!canGenerate(profile.plan, theirCountThisMonth)) {
  return NextResponse.json({ error: 'Generation limit reached. Upgrade to continue.' }, { status: 403 })
}
```

---

## 9. Test Mode Checklist

Before going live:

- [ ] Set `STRIPE_SECRET_KEY` to `sk_test_...` for local dev
- [ ] Use test card `4242 4242 4242 4242` (any future date, any CVC)
- [ ] Trigger webhook locally with [Stripe CLI](https://stripe.com/docs/stripe-cli): `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
- [ ] Verify `plan` column updates in Supabase after checkout
- [ ] Test downgrade via Stripe Customer Portal
- [ ] Test failed payment with card `4000 0000 0000 0341`

---

## 10. Add `NEXT_PUBLIC_APP_URL` to env

```bash
# .env.local
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Vercel production env
NEXT_PUBLIC_APP_URL=https://modulehire.com
```
