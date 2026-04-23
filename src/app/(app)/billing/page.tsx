import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PLAN_LIMITS, Plan } from '@/lib/plans';

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2.5 7l3.5 3.5 5.5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function PlanFeature({ text }: { text: string }) {
  return (
    <div className="pricing-feature">
      <span className="pricing-feature-icon"><IconCheck /></span>
      {text}
    </div>
  );
}

function formatLimit(n: number, unit: string) {
  return n === -1 ? `Unlimited ${unit}` : `${n} ${unit}`;
}

const PLANS: Array<{
  key: Plan;
  name: string;
  price: string;
  desc: string;
  features: string[];
  cta: string;
}> = [
  {
    key: 'free',
    name: 'Free',
    price: '$0/mo',
    desc: 'Get started with the basics.',
    features: [
      formatLimit(PLAN_LIMITS.free.modules, 'modules'),
      formatLimit(PLAN_LIMITS.free.resumes_per_month, 'resume generations/mo'),
      formatLimit(PLAN_LIMITS.free.matches_per_month, 'job matches/mo'),
      'Temporary file storage (24h)',
    ],
    cta: 'Current plan',
  },
  {
    key: 'standard',
    name: 'Standard',
    price: '$9/mo',
    desc: 'For active job seekers.',
    features: [
      formatLimit(PLAN_LIMITS.standard.modules, 'modules'),
      formatLimit(PLAN_LIMITS.standard.resumes_per_month, 'resume generations/mo'),
      'Unlimited job matches',
      'Permanent file storage',
    ],
    cta: 'Upgrade to Standard',
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$29/mo',
    desc: 'Unlimited everything.',
    features: [
      'Unlimited modules',
      'Unlimited resume generations',
      'Unlimited job matches',
      'Permanent file storage',
    ],
    cta: 'Upgrade to Pro',
  },
];

export default async function PricingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: profile } = await supabase
    .from('users')
    .select('plan, stripe_customer_id')
    .eq('id', user.id)
    .single();

  const currentPlan = (profile?.plan ?? 'free') as Plan;
  const hasStripe = !!profile?.stripe_customer_id;
  const returnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('supabase.co', 'modulehire.com') ?? ''}/pricing`;

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Plans &amp; Billing</span>
          <span className="topbar-sub">— Choose the plan that fits your search</span>
        </div>
      </div>

      <div className="dash-content">
        <div className="pricing-grid">
          {PLANS.map(plan => {
            const isCurrent = plan.key === currentPlan;
            const isDowngrade = (
              (currentPlan === 'pro' && plan.key !== 'pro') ||
              (currentPlan === 'standard' && plan.key === 'free')
            );

            return (
              <div key={plan.key} className={`pricing-card${isCurrent ? ' current' : ''}`}>
                {isCurrent && <div className="pricing-badge">Current plan</div>}
                <div className="pricing-card-name">{plan.name}</div>
                <div className="pricing-card-price">{plan.price}</div>
                <div className="pricing-card-desc">{plan.desc}</div>
                <div className="pricing-features">
                  {plan.features.map(f => <PlanFeature key={f} text={f} />)}
                </div>

                {isCurrent ? (
                  hasStripe ? (
                    <form action="/api/stripe/portal" method="POST">
                      <input type="hidden" name="returnUrl" value={`/billing`} />
                      <button type="submit" className="btn-ghost" style={{ width: '100%' }}>
                        Manage billing
                      </button>
                    </form>
                  ) : (
                    <button className="btn-ghost" disabled style={{ width: '100%' }}>
                      Current plan
                    </button>
                  )
                ) : isDowngrade ? null : (
                  <form action="/api/stripe/checkout" method="POST">
                    <input type="hidden" name="plan" value={plan.key} />
                    <input type="hidden" name="returnUrl" value={`/billing`} />
                    <button type="submit" className="btn-primary" style={{ width: '100%' }}>
                      {plan.cta}
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>

        <div className="section-card" style={{ marginTop: 24 }}>
          <div className="section-head">
            <div className="section-head-title">Frequently asked questions</div>
          </div>
          <div style={{ padding: '8px 20px 20px' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>What counts as a module?</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>Each skill block extracted from your resume is one module. A typical resume produces 8–20 modules.</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>What happens when I hit my monthly limit?</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>You'll see a message and an upgrade prompt. Existing modules and resumes are never deleted.</div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Can I cancel anytime?</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>Yes. Cancel from the billing portal and you'll stay on your paid plan until the period ends, then revert to Free.</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
