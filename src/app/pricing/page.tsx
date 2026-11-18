import type { Metadata } from 'next'
import Link from 'next/link'
import PublicNav from '@/components/layout/PublicNav'
import PublicFooter from '@/components/layout/PublicFooter'
import FaqItem from '@/components/ui/FaqItem'
import SprintButton from '@/components/SprintButton'
import { FREE_LIMITS } from '@/lib/entitlements'
import '@/app/warm.css'
import './pricing.css'

export const metadata: Metadata = {
  title: 'Pricing: Sprints, not subscriptions | ModuleHire',
  description: 'Start free. When you are actively applying, buy a 30-day ($19) or 90-day ($45) Sprint. One payment, no auto-renew.',
}

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    note: 'for as long as you like',
    tone: 'var(--h-sage)',
    features: [
      'Your module library and confirmations',
      `${FREE_LIMITS.resumes} resume and ${FREE_LIMITS.otherDocuments} other documents imported`,
      `${FREE_LIMITS.tailored} tailored resumes`,
      'Every export format',
      `${FREE_LIMITS.practiceRounds} practice round`,
    ],
  },
  {
    key: 'sprint_30',
    name: '30-day Sprint',
    price: '$19',
    note: 'one time',
    tone: 'var(--h-peach)',
    features: [
      'Unlimited tailored resumes (fair use 100 per 30 days)',
      'Live editing and fit',
      'Unlimited documents (fair use 30 a month)',
      'Interview practice (fair use 60 graded answers a month)',
      'Outreach drafts',
      'Application insights',
    ],
  },
  {
    key: 'sprint_90',
    name: '90-day Sprint',
    price: '$45',
    note: 'one time',
    tone: 'var(--h-lavender)',
    features: [
      'Everything in the 30-day Sprint',
      'Fair-use allowances pool across all 90 days',
      'For a longer search, at $15 a month',
    ],
  },
] as const

const PROMISES = [
  'No auto-renew. One payment, and we never charge you again unless you choose to.',
  'Built to get you hired, not to keep you paying.',
  'Your data stays yours. Download or delete anytime.',
]

export default function Pricing() {
  return (
    <>
      <PublicNav />
      <main className="warm pr-page">
        <div className="warm-inner">
          <header className="pr-hero">
            <div className="warm-eyebrow">Pricing</div>
            <h1 className="pr-title">Sprints, not subscriptions</h1>
            <p className="warm-sub pr-lede">
              Build your library for free. When you&apos;re actively applying, buy a Sprint. When it ends, nothing renews and nothing is deleted.
            </p>
          </header>

          <section className="pr-cards" aria-label="Plans">
            {PLANS.map(p => (
              <article key={p.key} className={`pr-card${p.key === 'sprint_30' ? ' pr-card-main' : ''}`}>
                <div className="pr-card-top" style={{ background: p.tone }}>
                  <h2 className="pr-name">{p.name}</h2>
                  <div className="pr-price">{p.price} <span>{p.note}</span></div>
                </div>
                <ul className="pr-features">
                  {p.features.map(f => <li key={f}>{f}</li>)}
                </ul>
                <div className="pr-cta">
                  {p.key === 'free' ? (
                    <Link href="/signin" className="warm-btn warm-btn-ghost">Start free</Link>
                  ) : (
                    <SprintButton sku={p.key} label={p.key === 'sprint_30' ? 'Start a 30-day Sprint' : 'Start a 90-day Sprint'} className={p.key === 'sprint_30' ? 'warm-btn' : 'warm-btn warm-btn-ghost'} returnUrl="/billing" />
                  )}
                </div>
              </article>
            ))}
          </section>

          <section className="pr-promises" aria-label="Our promises">
            {PROMISES.map(p => (
              <p key={p} className="pr-promise">{p}</p>
            ))}
          </section>

          <section className="pr-faq">
            <h2 className="warm-h2">Questions about Sprints</h2>
            <FaqItem question="What happens when my Sprint ends?" answer="Your account goes back to Free limits. Your library, resumes, jobs and files all stay, and nothing is charged. We email you 3 days before it ends and on the day it does." />
            <FaqItem question="Can I extend a Sprint?" answer="Yes. Buying another Sprint while one is active adds its days after your current end date, so you never lose time you paid for." />
            <FaqItem question="What does fair use mean?" answer="Generous caps that a real job search never reaches (for example 100 tailored resumes per 30 days). They stop automated abuse, not you. A 90-day Sprint pools its allowance across all 90 days." />
            <FaqItem question="Do you offer refunds?" answer="If you're not satisfied within the first 7 days of a Sprint, we'll refund you. Email support@modulehire.com." />
          </section>
        </div>
      </main>
      <PublicFooter />
    </>
  )
}
