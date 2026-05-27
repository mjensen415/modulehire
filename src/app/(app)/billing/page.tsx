import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isProTier } from '@/lib/plan';
import BillingActions, { type Sku } from './BillingActions';

type PlanCard = {
  sku: Sku
  name: string
  price: string
  priceSub?: string
  desc: string
  features: string[]
  cta: string
  recommended?: boolean
}

const SUBSCRIPTION_PLANS: PlanCard[] = [
  {
    sku: 'pro_monthly',
    name: 'Pro Monthly',
    price: '$19',
    priceSub: '/mo',
    desc: 'Unlimited everything, billed monthly.',
    features: [
      'Unlimited tailored resumes',
      'Full ATS Estimator breakdown',
      'Full module editing',
      'Multiple resume uploads',
      'Priority generation',
    ],
    cta: 'Upgrade to Pro Monthly',
    recommended: true,
  },
  {
    sku: 'pro_annual',
    name: 'Pro Annual',
    price: '$99',
    priceSub: '/yr',
    desc: 'Everything in Pro — save two months.',
    features: [
      'Everything in Pro Monthly',
      'Billed annually',
      '~ $8.25/month effective',
    ],
    cta: 'Upgrade to Pro Annual',
  },
]

const ONE_TIME_PURCHASES: PlanCard[] = [
  {
    sku: 'single',
    name: 'Single resume',
    price: '$9',
    desc: 'One tailored resume. No subscription.',
    features: ['1 resume credit', 'Never expires', 'DOCX + PDF download'],
    cta: 'Buy 1 resume — $9',
  },
  {
    sku: 'five_pack',
    name: '5-pack',
    price: '$29',
    desc: 'Five credits. ~ $5.80 each.',
    features: ['5 resume credits', 'Never expires', 'DOCX + PDF download'],
    cta: 'Buy 5-pack — $29',
  },
]

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: profile } = await supabase
    .from('users')
    .select('plan, tier, stripe_customer_id')
    .eq('id', user.id)
    .single();

  const tier = (profile?.tier ?? 'free') as string;
  const proCurrent = isProTier(tier);
  const hasStripe = !!profile?.stripe_customer_id;

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Plans &amp; Billing</span>
          <span className="topbar-sub">— Choose the plan that fits your search</span>
        </div>
      </div>

      <div className="dash-content">
        <div className="section-card" style={{ marginBottom: 24 }}>
          <div className="section-head">
            <div className="section-head-title">Subscriptions</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Unlimited resumes + full ATS Estimator</div>
          </div>
          <div className="pricing-grid" style={{ padding: '12px 20px 20px' }}>
            {SUBSCRIPTION_PLANS.map(plan => {
              const isCurrent = proCurrent && (
                (plan.sku === 'pro_monthly' && profile?.plan !== 'pro_annual') ||
                plan.sku === 'pro_annual' && profile?.plan === 'pro_annual'
              );
              return (
                <div key={plan.sku} className={`pricing-card${isCurrent ? ' current' : ''}`}>
                  {isCurrent && <div className="pricing-badge">Current plan</div>}
                  {!isCurrent && plan.recommended && <div className="pricing-badge">Most popular</div>}
                  <div className="pricing-card-name">{plan.name}</div>
                  <div className="pricing-card-price">
                    {plan.price}{plan.priceSub && <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text3)' }}>{plan.priceSub}</span>}
                  </div>
                  <div className="pricing-card-desc">{plan.desc}</div>
                  <div className="pricing-features">
                    {plan.features.map(f => (
                      <div key={f} className="pricing-feature">
                        <span className="pricing-feature-icon">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2.5 7l3.5 3.5 5.5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                        {f}
                      </div>
                    ))}
                  </div>
                  <BillingActions
                    sku={plan.sku}
                    cta={plan.cta}
                    isCurrent={isCurrent}
                    hasStripe={hasStripe}
                    variant={plan.recommended ? 'primary' : 'secondary'}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="section-card">
          <div className="section-head">
            <div className="section-head-title">One-time purchases</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Pay per resume — credits never expire</div>
          </div>
          <div className="pricing-grid" style={{ padding: '12px 20px 20px' }}>
            {ONE_TIME_PURCHASES.map(p => (
              <div key={p.sku} className="pricing-card">
                <div className="pricing-card-name">{p.name}</div>
                <div className="pricing-card-price">{p.price}</div>
                <div className="pricing-card-desc">{p.desc}</div>
                <div className="pricing-features">
                  {p.features.map(f => (
                    <div key={f} className="pricing-feature">
                      <span className="pricing-feature-icon">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M2.5 7l3.5 3.5 5.5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                      {f}
                    </div>
                  ))}
                </div>
                <BillingActions sku={p.sku} cta={p.cta} variant="secondary" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
