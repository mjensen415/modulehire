import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'
import { getOrgRole } from '@/lib/business/org-access'
import { BUSINESS_PLANS, TEAM_PRICE_LABEL, getOrgPlan, getOrgUsage } from '@/lib/business/plan'

// GET /api/business/billing/usage?org_id= → the org's plan, this month's usage, and
// whether it has a billing account (for the Manage billing button).
export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgId = new URL(req.url).searchParams.get('org_id')
    if (!isUuid(orgId)) return NextResponse.json({ error: 'Invalid org_id' }, { status: 400 })

    const role = await getOrgRole(supabase, orgId, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [plan, usage, org] = await Promise.all([
      getOrgPlan(supabase, orgId),
      getOrgUsage(supabase, orgId),
      supabase.from('organizations').select('stripe_customer_id').eq('id', orgId).single(),
    ])

    return NextResponse.json({
      plan,
      usage,
      team: { ...BUSINESS_PLANS.growth, price: TEAM_PRICE_LABEL },
      has_billing_account: !!org.data?.stripe_customer_id,
      role,
    })
  } catch (error) {
    console.error('[api/business/billing/usage]', error)
    return NextResponse.json({ error: 'Could not load plan.' }, { status: 500 })
  }
}
