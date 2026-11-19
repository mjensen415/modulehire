import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { BUSINESS_PLANS, TEAM_PRICE_LABEL } from '@/lib/business/plan'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

// Relative links keep visitors on business.modulehire.com, so signup returns here
// and /business routes a new account to org onboarding (not job-seeker onboarding).
const SIGNUP_HREF = '/signin?signup=1&next=/business'
const SIGNIN_HREF = '/signin?next=/business'
const DEMO_HREF = '/business/demo'

// Logged-in users skip the landing page entirely.
// Logged-out users see the marketing page below.
export default async function BusinessPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: membership } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    redirect(membership ? '/business/dashboard' : '/business/onboarding')
  }

  return <BusinessLanding />
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
        background: 'var(--teal-dim)', border: '1px solid var(--teal-glow)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 800, color: 'var(--teal)',
      }}>
        {n}
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.65 }}>{body}</div>
      </div>
    </div>
  )
}

function Callout({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '22px 24px',
    }}>
      <div style={{ fontSize: 26, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }}>{body}</div>
    </div>
  )
}

function PriceCard({ name, price, cadence, features, cta, highlight }: {
  name: string; price: string; cadence: string; features: string[]; cta: { label: string; href: string }; highlight?: boolean
}) {
  return (
    <div style={{
      background: 'var(--bg)', borderRadius: 16, padding: '28px 26px',
      border: highlight ? '2px solid var(--teal)' : '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: highlight ? 'var(--teal)' : 'var(--text2)', marginBottom: 10 }}>{name}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 18 }}>
        <span style={{ fontSize: 38, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.04em' }}>{price}</span>
        <span style={{ fontSize: 13, color: 'var(--text3)' }}>{cadence}</span>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
        {features.map((f) => (
          <li key={f} style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.5, display: 'flex', gap: 8 }}>
            <span style={{ color: 'var(--teal)' }}>✓</span><span>{f}</span>
          </li>
        ))}
      </ul>
      <Link href={cta.href} style={{
        textAlign: 'center', fontSize: 14, fontWeight: 700, textDecoration: 'none', padding: '11px 18px', borderRadius: 8,
        color: highlight ? '#fff' : 'var(--text)', background: highlight ? 'var(--teal)' : 'transparent',
        border: highlight ? 'none' : '1px solid var(--border2)',
      }}>
        {cta.label}
      </Link>
    </div>
  )
}

function BusinessLanding() {
  return (
    <div style={{ fontFamily: 'var(--font)' }}>

      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 48px', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 10,
      }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            ModuleHire
          </span>
          <span style={{
            marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--teal)',
            fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em',
            background: 'var(--teal-dim)', border: '1px solid var(--teal-glow)',
            padding: '2px 7px', borderRadius: 5,
          }}>
            for Business
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href={DEMO_HREF} style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text2)',
            textDecoration: 'none', padding: '7px 10px',
          }}>
            Demo
          </Link>
          <Link href="#pricing" style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text2)',
            textDecoration: 'none', padding: '7px 10px',
          }}>
            Pricing
          </Link>
          <Link href={SIGNIN_HREF} style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text2)',
            textDecoration: 'none', padding: '7px 14px',
            border: '1px solid var(--border2)', borderRadius: 7,
          }}>
            Sign in
          </Link>
          <Link href={SIGNUP_HREF} style={{
            fontSize: 13, fontWeight: 700, color: 'var(--on-teal)',
            textDecoration: 'none', padding: '8px 16px',
            background: 'var(--teal)', borderRadius: 7,
          }}>
            Get started free →
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        maxWidth: 780, margin: '0 auto', padding: '96px 32px 80px',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          background: 'var(--teal-dim)', border: '1px solid var(--teal-glow)',
          borderRadius: 20, padding: '5px 14px', marginBottom: 32,
          fontSize: 12, fontWeight: 700, color: 'var(--teal)',
        }}>
          <span>✦</span>
          <span>AI-powered applicant screening</span>
        </div>

        <h1 style={{
          fontSize: 'clamp(36px, 5vw, 58px)', fontWeight: 900,
          color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1.08,
          marginBottom: 22,
        }}>
          Stop drowning in resumes.<br />
          <span style={{ color: 'var(--teal)' }}>Start hiring smarter.</span>
        </h1>

        <p style={{
          fontSize: 18, color: 'var(--text2)', lineHeight: 1.65,
          maxWidth: 560, margin: '0 auto 40px', fontWeight: 400,
        }}>
          Paste a job description, set your criteria, and get every applicant scored and ranked, with the evidence behind each score.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href={SIGNUP_HREF} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 15, fontWeight: 700, color: 'var(--on-teal)',
            textDecoration: 'none', padding: '13px 28px',
            background: 'var(--teal)', borderRadius: 9,
            boxShadow: '0 8px 28px color-mix(in srgb, var(--teal) 30%, transparent)',
          }}>
            Try it free →
          </Link>
          <Link href={DEMO_HREF} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 15, fontWeight: 600, color: 'var(--text2)',
            textDecoration: 'none', padding: '13px 28px',
            border: '1px solid var(--border2)', borderRadius: 9,
          }}>
            See a live demo
          </Link>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 20 }}>
          Free plan, no credit card · The demo needs no account
        </p>
      </section>

      {/* Score preview strip */}
      <section style={{
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)', padding: '36px 48px',
        overflow: 'hidden',
      }}>
        <div style={{
          maxWidth: 900, margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
        }}>
          {[
            { name: 'Alex M.', headline: 'Senior Product Manager · 8 yrs', score: 91, bar: '#1d9e75' },
            { name: 'Jordan K.', headline: 'Product Manager · 4 yrs', score: 74, bar: '#f59e0b' },
            { name: 'Taylor R.', headline: 'Associate PM · 2 yrs', score: 43, bar: '#ef4444' },
          ].map((a) => (
            <div key={a.name} style={{
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '16px 18px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{a.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>{a.headline}</div>
                </div>
                <div style={{
                  fontSize: 20, fontWeight: 900, color: a.bar,
                  letterSpacing: '-0.03em', lineHeight: 1,
                }}>
                  {a.score}
                </div>
              </div>
              <div style={{ height: 5, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${a.score}%`, height: '100%', background: a.bar, borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)', marginTop: 16 }}>
          Sample candidates. <Link href={DEMO_HREF} style={{ color: 'var(--teal)', textDecoration: 'none', fontWeight: 600 }}>Open the demo</Link> to see the full breakdown and evidence.
        </p>
      </section>

      {/* How it works */}
      <section id="how-it-works" style={{ maxWidth: 680, margin: '0 auto', padding: '80px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            How it works
          </div>
          <h2 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            From job description to ranked shortlist in three steps
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          <Step
            n="1"
            title="Paste your job description"
            body="Drop in a job description and ModuleHire extracts your scoring criteria. Promote anything to a dealbreaker, demote what doesn't matter, add custom signals. Your rubric, not ours."
          />
          <div style={{ borderLeft: '1px dashed var(--border2)', height: 24, marginLeft: 20 }} />
          <Step
            n="2"
            title="Upload applicants in bulk or one at a time"
            body="CSV batch upload for large pipelines or drag-and-drop individual PDFs and Word docs. Each resume is parsed, extracted, and queued for scoring automatically."
          />
          <div style={{ borderLeft: '1px dashed var(--border2)', height: 24, marginLeft: 20 }} />
          <Step
            n="3"
            title="Review ranked candidates with full AI evidence"
            body="Every applicant gets a score from 0–100, broken down by criterion. See exactly what evidence the AI found, or didn't, so you can trust the ranking or override it."
          />
        </div>

        <div style={{ textAlign: 'center', marginTop: 52 }}>
          <Link href={SIGNUP_HREF} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 14, fontWeight: 700, color: 'var(--on-teal)',
            textDecoration: 'none', padding: '12px 26px',
            background: 'var(--teal)', borderRadius: 8,
          }}>
            Start screening smarter →
          </Link>
        </div>
      </section>

      {/* Why ModuleHire for Business */}
      <section style={{
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)', padding: '80px 48px',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
              Why teams switch
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>
              Built for hiring teams, not HR software vendors
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Callout
              icon="🎯"
              title="Your criteria, not a black box"
              body="You define what matters: dealbreakers, must-haves, nice-to-haves. The AI scores against your rubric, not a generic model of what 'good' looks like."
            />
            <Callout
              icon="⚡"
              title="Minutes, not weeks"
              body="Upload a whole batch at once and every applicant is scored while you get on with your day. No first-pass resume skim, no missed candidates."
            />
            <Callout
              icon="📋"
              title="Evidence you can stand behind"
              body="Every score comes with quoted evidence from the resume. When a hiring manager asks why someone scored 82, you can show them exactly why."
            />
            <Callout
              icon="🔁"
              title="One pipeline for every role"
              body="Run multiple job postings simultaneously. Each has its own criteria, applicant list, and scoring, kept completely separate."
            />
            <Callout
              icon="🤝"
              title="Track every candidate"
              body="Add notes and move applicants through Shortlisted, Interviewing and Offered, all from one ranked list."
            />
            <Callout
              icon="🔒"
              title="Your data stays yours"
              body="Applicant data is stored securely and scoped to your organization. No third-party sharing, no data used to train models."
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ maxWidth: 820, margin: '0 auto', padding: '88px 32px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Pricing
          </div>
          <h2 style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>
            Start free. Upgrade when you&apos;re hiring for real.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          <PriceCard
            name="Free"
            price="$0"
            cadence="forever"
            features={[
              `${BUSINESS_PLANS.starter.activeJobs} active job posting`,
              `${BUSINESS_PLANS.starter.monthlyScores} scored applicants a month`,
              'Custom criteria and dealbreakers',
              'Quoted evidence for every score',
            ]}
            cta={{ label: 'Start free', href: SIGNUP_HREF }}
          />
          <PriceCard
            name="Team"
            price={TEAM_PRICE_LABEL}
            cadence="per month"
            highlight
            features={[
              'Unlimited active job postings',
              `${BUSINESS_PLANS.growth.monthlyScores} scored applicants a month`,
              'Everything in Free',
              'Cancel any time',
            ]}
            cta={{ label: 'Start free, upgrade in Settings', href: SIGNUP_HREF }}
          />
        </div>
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text3)', marginTop: 20 }}>
          Hiring at higher volume?{' '}
          <a href="mailto:info@modulehire.com?subject=ModuleHire%20for%20Business" style={{ color: 'var(--teal)', textDecoration: 'none', fontWeight: 600 }}>
            Talk to us
          </a>
          .
        </p>
      </section>

      {/* Bottom CTA */}
      <section style={{ maxWidth: 600, margin: '0 auto', padding: '96px 32px', textAlign: 'center' }}>
        <h2 style={{
          fontSize: 34, fontWeight: 900, color: 'var(--text)',
          letterSpacing: '-0.03em', lineHeight: 1.12, marginBottom: 18,
        }}>
          Ready to find your best candidates faster?
        </h2>
        <p style={{ fontSize: 16, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 36 }}>
          Set up your organization, post a job, and upload your first batch of applicants on the free plan.
        </p>
        <Link href={SIGNUP_HREF} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: 15, fontWeight: 700, color: 'var(--on-teal)',
          textDecoration: 'none', padding: '14px 32px',
          background: 'var(--teal)', borderRadius: 9,
          boxShadow: '0 8px 28px color-mix(in srgb, var(--teal) 30%, transparent)',
        }}>
          Get started free →
        </Link>
        <p style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 16 }}>
          Already have an account?{' '}
          <Link href={SIGNIN_HREF} style={{ color: 'var(--teal)', textDecoration: 'none', fontWeight: 600 }}>
            Sign in →
          </Link>
        </p>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border)', padding: '24px 48px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          © {new Date().getFullYear()} ModuleHire · For Business
        </div>
        <a href="https://modulehire.com" style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none' }}>
          ← ModuleHire for job seekers
        </a>
      </footer>

    </div>
  )
}
