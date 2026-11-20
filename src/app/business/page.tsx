import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { BUSINESS_PLANS, TEAM_PRICE_LABEL } from '@/lib/business/plan'
import '@/app/warm.css'
import './landing.css'

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

type Pip = 0 | 1 | 2 | 3 | 4 | 5

function Pips({ n }: { n: Pip }) {
  return (
    <div className="bl-pips" role="img" aria-label={`${n} of 5`}>
      {[0, 1, 2, 3, 4].map((i) => <span key={i} className={i < n ? 'on' : undefined} />)}
    </div>
  )
}

function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <rect x="2" y="14" width="10" height="10" rx="2" fill="#1f6f63" />
      <rect x="14" y="14" width="10" height="10" rx="2" fill="#5fbfa8" />
      <rect x="8" y="2" width="10" height="10" rx="2" fill="#1f6f63" opacity="0.55" />
    </svg>
  )
}

// Sample rows for the ranking grid. Fictional people; weights match score-applicant.ts
// (dealbreaker 3x, must-have 2x, nice-to-have 1x; a missed dealbreaker caps the score at 25).
const SAMPLE: { rank: string; name: string; head: string; db: boolean; ds: Pip; rs: Pip; fin: Pip; score: number; lead?: boolean }[] = [
  { rank: '1', name: 'Priya Raman', head: 'Design systems lead', db: true, ds: 5, rs: 4, fin: 2, score: 94, lead: true },
  { rank: '2', name: 'Daniel Okafor', head: 'Fintech product design', db: true, ds: 4, rs: 3, fin: 5, score: 89 },
  { rank: '3', name: 'Sofia Lindqvist', head: 'Agency to in-house', db: true, ds: 4, rs: 4, fin: 1, score: 86 },
  { rank: '–', name: 'Alex Rivera', head: 'Visual designer, 3 years', db: false, ds: 3, rs: 3, fin: 0, score: 25 },
]

function BusinessLanding() {
  const year = new Date().getFullYear()
  return (
    <div className="warm bl">
      <header className="bl-nav">
        <div className="bl-wrap bl-nav-in">
          <Link href="/business" className="bl-brand">
            <Mark />
            <span className="bl-brand-name">ModuleHire</span>
            <span className="bl-tag">BUSINESS</span>
          </Link>
          <div className="bl-links" role="navigation" aria-label="Main">
            <Link href="#how-it-works" className="bl-link">How it works</Link>
            <Link href={DEMO_HREF} className="bl-link">Demo</Link>
            <Link href="#pricing" className="bl-link">Pricing</Link>
            <Link href={SIGNIN_HREF} className="bl-link">Sign in</Link>
            <Link href={SIGNUP_HREF} className="bl-btn">Start free</Link>
          </div>
        </div>
      </header>

      <main className="bl-wrap">
        <header className="bl-hero">
          <h1 className="bl-h1">Rank your whole pipeline in minutes.</h1>
          <p className="bl-lede">
            Every applicant scored against what the job actually needs, with the line from their resume that earned each point.
          </p>
          <div className="bl-cta-row">
            <Link href={SIGNUP_HREF} className="bl-btn bl-btn-lg">Start free</Link>
            <Link href={DEMO_HREF} className="bl-btn bl-btn-ghost bl-btn-lg">See a live demo</Link>
          </div>
          <p className="bl-small">Free plan, no credit card. The demo needs no account.</p>
        </header>

        <section id="how-it-works" aria-labelledby="how-h" className="bl-section">
          <h2 id="how-h" className="bl-eyebrow">How it works</h2>
          <div className="bl-steps">
            <div className="bl-step">
              <span className="bl-step-n">1</span>
              <h3>Paste the job</h3>
              <p>We pull out the requirements. You set what each one is worth, and add your own.</p>
              <div className="bl-weights">
                <div className="bl-weight"><span className="bl-chip db">Dealbreaker</span>5+ years product design</div>
                <div className="bl-weight"><span className="bl-chip must">Must have</span>Built a design system</div>
                <div className="bl-weight"><span className="bl-chip must">Must have</span>Customer research</div>
                <div className="bl-weight"><span className="bl-chip nice">Nice to have</span>Fintech or payments</div>
              </div>
            </div>
            <div className="bl-step">
              <span className="bl-step-n">2</span>
              <h3>Bring in applicants</h3>
              <p>Connect your ATS, drop in an export, or upload resumes. Nothing to re-key.</p>
              <div className="bl-pills">
                {['Greenhouse', 'Lever', 'Ashby', 'Workable', 'BambooHR'].map((p) => <span key={p} className="bl-pill">{p}</span>)}
                <span className="bl-pill sand">CSV or Excel export</span>
              </div>
              <p className="bl-small">Candidates who opted out of AI review in Greenhouse are never imported.</p>
            </div>
            <div className="bl-step dark">
              <span className="bl-step-n">3</span>
              <h3>Get a ranked list</h3>
              <p>Scores from 0 to 100, best first. Each one shows its evidence and can post back to your ATS.</p>
              <div className="bl-mini">
                <div className="bl-mini-row"><span className="bl-mini-score top">94</span>Priya Raman</div>
                <div className="bl-mini-row"><span className="bl-mini-score">89</span>Daniel Okafor</div>
                <div className="bl-mini-row"><span className="bl-mini-score">86</span>Sofia Lindqvist</div>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="rank-h" className="bl-section">
          <h2 id="rank-h" className="bl-h2">See why each candidate ranks where they do.</h2>
          <p className="bl-h2-sub">Each criterion is scored on its own, so you see the whole field at a glance, not one resume at a time.</p>
          <div className="bl-grid-card">
            <table className="bl-grid">
              <caption className="sr-only">Sample candidates ranked by score, with each criterion&apos;s result</caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Candidate</th>
                  <th scope="col"><small className="db">Dealbreaker</small>5+ yrs design</th>
                  <th scope="col"><small className="must">Must have</small>Design system</th>
                  <th scope="col"><small className="must">Must have</small>Research</th>
                  <th scope="col"><small>Nice to have</small>Fintech</th>
                  <th scope="col">Score</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE.map((r) => (
                  <tr key={r.name} className={r.lead ? 'lead' : !r.db ? 'out' : undefined}>
                    <td className="bl-rank">{r.rank}</td>
                    <td><div className="bl-name">{r.name}</div><div className="bl-head">{r.head}</div></td>
                    <td>{r.db ? <span className="bl-met">Met</span> : <span className="bl-missed">Missed</span>}</td>
                    <td><Pips n={r.ds} /></td>
                    <td><Pips n={r.rs} /></td>
                    <td><Pips n={r.fin} /></td>
                    <td><span className={`bl-score${r.lead ? ' top' : !r.db ? ' capped' : ''}`}>{r.score}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="bl-note">Sample candidates. <Link href={DEMO_HREF} className="warm-link">Open the demo</Link> for the full breakdown and evidence.</p>
          <div className="bl-explain">
            <div className="bl-ex clay">
              <strong>Dealbreakers are a gate</strong>
              <span>Miss one and the score is capped at 25, so a strong resume for the wrong role never jumps the line. They&apos;re hidden by default.</span>
            </div>
            <div className="bl-ex teal">
              <strong>Weights you control</strong>
              <span>Dealbreakers count three times, must-haves twice, nice-to-haves once. Change a weight, rescore, and the list re-ranks.</span>
            </div>
            <div className="bl-ex sand">
              <strong>Evidence, not vibes</strong>
              <span>Every score quotes the resume line behind it, so when a hiring manager asks why someone scored 82, you can show them.</span>
            </div>
          </div>
        </section>

        <section aria-labelledby="trust-h" className="bl-section">
          <h2 id="trust-h" className="bl-h2">Built for hiring teams.</h2>
          <div className="bl-trust">
            <div className="bl-trust-item"><strong>One pipeline per role</strong><span>Each posting has its own criteria, applicants and scores, kept separate.</span></div>
            <div className="bl-trust-item"><strong>Track every candidate</strong><span>Notes and stages from New to Offered, all from the ranked list.</span></div>
            <div className="bl-trust-item"><strong>Your ATS stays in charge</strong><span>Scores post back as notes. Nothing in your ATS is moved or changed.</span></div>
            <div className="bl-trust-item"><strong>Your data stays yours</strong><span>Applicant data is scoped to your organization and never used to train AI models.</span></div>
          </div>
        </section>

        <section id="pricing" aria-labelledby="price-h" className="bl-section">
          <p className="bl-eyebrow">Pricing</p>
          <h2 id="price-h" className="bl-h2">Start free. Upgrade when you&apos;re hiring for real.</h2>
          <div className="bl-prices">
            <div className="bl-price">
              <span className="bl-price-name">Free</span>
              <span className="bl-price-amt">$0<small>forever</small></span>
              <ul>
                <li>{BUSINESS_PLANS.starter.activeJobs} active job posting</li>
                <li>{BUSINESS_PLANS.starter.monthlyScores} scored applicants a month</li>
                <li>Custom criteria and dealbreakers</li>
                <li>ATS import and file export import</li>
              </ul>
              <Link href={SIGNUP_HREF} className="bl-btn bl-btn-ghost">Start free</Link>
            </div>
            <div className="bl-price hi">
              <span className="bl-price-name">Team</span>
              <span className="bl-price-amt">{TEAM_PRICE_LABEL}<small>per month</small></span>
              <ul>
                <li>Unlimited active job postings</li>
                <li>{BUSINESS_PLANS.growth.monthlyScores} scored applicants a month</li>
                <li>Everything in Free</li>
                <li>Cancel any time</li>
              </ul>
              <Link href={SIGNUP_HREF} className="bl-btn">Start free, upgrade in Settings</Link>
            </div>
          </div>
          <p className="bl-note">
            Hiring at higher volume?{' '}
            <a href="mailto:info@modulehire.com?subject=ModuleHire%20for%20Business" className="warm-link">Talk to us</a>.
          </p>
        </section>

        <section className="bl-final" aria-labelledby="final-h">
          <div>
            <div id="final-h" className="bl-final-h">Try it on your next posting.</div>
            <p>
              Free: {BUSINESS_PLANS.starter.activeJobs} posting and {BUSINESS_PLANS.starter.monthlyScores} scored applicants a month. Team: {TEAM_PRICE_LABEL}/month for {BUSINESS_PLANS.growth.monthlyScores}.
            </p>
          </div>
          <Link href={SIGNUP_HREF} className="bl-btn bl-btn-lg">Start free</Link>
        </section>
      </main>

      <footer className="bl-foot">
        <div className="bl-wrap bl-foot-in">
          <span>© {year} ModuleHire · For Business</span>
          <a href="https://modulehire.com">ModuleHire for job seekers</a>
        </div>
      </footer>
    </div>
  )
}
