import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const ALLOWED_TIERS = ['free', 'pro', 'beta_pro'] as const
type Tier = (typeof ALLOWED_TIERS)[number]

// Maps a tier to the coarse-grained `plan` column. Both paid tiers map to 'pro'.
const PLAN_FOR_TIER: Record<Tier, string> = {
  free: 'free',
  pro: 'pro',
  beta_pro: 'pro',
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { user_id, tier } = await req.json().catch(() => ({}))
  if (typeof user_id !== 'string' || !user_id.trim()) {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
  }
  if (!ALLOWED_TIERS.includes(tier)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
  }

  const update: {
    tier: Tier
    plan: string
    stripe_subscription_id?: null
    plan_period_end?: null
  } = {
    tier,
    plan: PLAN_FOR_TIER[tier as Tier],
  }

  // Downgrading to free clears the Stripe subscription state. Upgrades leave any
  // existing subscription/period end untouched.
  if (tier === 'free') {
    update.stripe_subscription_id = null
    update.plan_period_end = null
  }

  const adminClient = await createAdminClient()
  const { error } = await adminClient.from('users').update(update).eq('id', user_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, tier })
}
