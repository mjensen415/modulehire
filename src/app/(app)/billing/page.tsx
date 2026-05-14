import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FREE_LIMIT, moduleLimit, uploadLimit } from '@/lib/plan';
import BillingActions from './BillingActions';

type Plan = 'free' | 'pro';

function fmtLimit(n: number, unit: string) {
  return Number.isFinite(n) ? `${n} ${unit}` : `Unlimited ${unit}`;
}

const PLANS: Array<{
  key: Plan;
  name: string;
  price: string;
  annualPrice: string;
  desc: string;
  features: string[];
  cta: string;
}> = [
  {
    key: 'free',
    name: 'Free',
    price: '$0/mo',
    annualPrice: '',
    desc: 'Try it out.',
    features: [
      fmtLimit(uploadLimit('free'), 'resume upload'),
      fmtLimit(moduleLimit('free'), 'modules'),
      `${FREE_LIMIT} resumes/mo`,
      'Or buy credits: $9 single · $29 5-pack',
      'DOCX + PDF download',
      'Paste JD input',
    ],
    cta: 'Current plan',
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$19/mo',
    annualPrice: '$99/yr',
    desc: 'Unlimited everything.',
    features: [
      'Unlimited resume uploads',
      'Unlimited modules',
      'Unlimited tailored resumes',
      'All 6 formats (PDF + DOCX)',
      'Full ATS optimization + live score',
      'Full generation history',
      'Priority access to new features',
    ],
    cta: 'Upgrade to Pro',
  },
];

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: profile } = await supabase
    .from('users')
    .select('plan, stripe_customer_id')
    .eq('id', user.id)
    .single();

  const rawPlan = (profile?.plan ?? 'free') as string;
  // 'starter' is a retired tier — surface those users as 'free' for upgrade prompts.
  const currentPlan: Plan = rawPlan === 'pro' ? 'pro' : 'free';
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
        <div className="pricing-grid">
          {PLANS.map(plan => {
            const isCurrent = plan.key === currentPlan;
            const isDowngrade = currentPlan === 'pro' && plan.key !== 'pro';

            return (
              <div key={plan.key} className={`pricing-card${isCurrent ? ' current' : ''}`}>
                {isCurrent && <div className="pricing-badge">Current plan</div>}
                <div className="pricing-card-name">{plan.name}</div>
                <div className="pricing-card-price">{plan.price}</div>
                {plan.annualPrice && (
                  <div style={{ fontSize: 12, color: 'var(--teal)', marginBottom: 4 }}>
                    or {plan.annualPrice} — save 2 months
                  </div>
                )}
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
                  planKey={plan.key}
                  cta={plan.cta}
                  isCurrent={isCurrent}
                  isDowngrade={isDowngrade}
                  hasStripe={hasStripe}
                />
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
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>What happens when I hit my free limit?</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>You can buy a single resume for $9, a 5-pack for $29 (credits never expire), or upgrade to Pro for unlimited. Your modules and history are never deleted.</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Do resume credits expire?</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>No — credits from single and 5-pack purchases never expire. Use them whenever you&apos;re ready.</div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Can I cancel anytime?</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>Yes. Cancel from the billing portal and you&apos;ll stay on your paid plan until the period ends, then revert to Free.</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
