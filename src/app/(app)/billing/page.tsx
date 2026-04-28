import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FREE_LIMIT, STARTER_LIMIT, moduleLimit, uploadLimit } from '@/lib/plan';
import BillingActions from './BillingActions';

type Plan = 'free' | 'starter' | 'pro';

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
      `${FREE_LIMIT} resumes/mo — $4 per additional`,
      'DOCX + PDF (24-hour links)',
      'Paste JD input',
    ],
    cta: 'Current plan',
  },
  {
    key: 'starter',
    name: 'Starter',
    price: '$29/mo',
    annualPrice: '$289/yr',
    desc: 'For active job seekers.',
    features: [
      fmtLimit(uploadLimit('starter'), 'resume uploads'),
      fmtLimit(moduleLimit('starter'), 'modules'),
      `${STARTER_LIMIT} resumes/mo`,
      'Permanent file storage',
      'Cover letter generation',
      'Save job descriptions',
      '60-day generation history',
    ],
    cta: 'Upgrade to Starter',
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$40/mo',
    annualPrice: '$399/yr',
    desc: 'Unlimited everything.',
    features: [
      'Unlimited resume uploads',
      'Unlimited modules',
      'Unlimited resumes',
      'Permanent file storage',
      'Cover letter generation',
      'Save job descriptions',
      'Full generation history',
      'Faster AI generation',
      'Early access to new features',
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

  const currentPlan = (profile?.plan ?? 'free') as Plan;
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
            const isDowngrade = (
              (currentPlan === 'pro' && plan.key !== 'pro') ||
              (currentPlan === 'starter' && plan.key === 'free')
            );

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
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>You&apos;ll get a prompt to pay $4 for one more resume, or upgrade to a paid plan for unlimited. Your modules and history are never deleted.</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>What&apos;s the difference between Starter and Pro?</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>Starter covers active job seekers — 3 uploads, 50 modules, 15 resumes/mo. Pro unlocks unlimited everything plus faster AI generation and early feature access.</div>
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
