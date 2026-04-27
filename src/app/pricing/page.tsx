'use client'

import { useState } from 'react';
import Link from 'next/link';
import PublicNav from '@/components/layout/PublicNav';
import PublicFooter from '@/components/layout/PublicFooter';
import FaqItem from '@/components/ui/FaqItem';

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: '-2px' }}>
      <circle cx="7" cy="7" r="5" strokeDasharray="10 22" opacity="0.35" />
      <path d="M7 2a5 5 0 015 5" />
    </svg>
  )
}

export default function Pricing() {
  const [upgrading, setUpgrading] = useState<Record<string, boolean>>({})

  async function handleUpgrade(plan: 'starter' | 'pro', interval: 'monthly' | 'annual') {
    const key = `${plan}-${interval}`
    setUpgrading(prev => ({ ...prev, [key]: true }))
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, interval }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.url) {
        window.location.href = data.url as string
        return
      }
      alert(data.error ?? 'Could not start checkout.')
    } catch (e) {
      alert((e as Error).message ?? 'Could not start checkout.')
    } finally {
      setUpgrading(prev => ({ ...prev, [key]: false }))
    }
  }

  const starterLoading = !!upgrading['starter-monthly']
  const proLoading = !!upgrading['pro-monthly']

  return (
    <>
      <PublicNav />

      <section className="page-hero">
        <div className="hero-glow"></div>
        <div className="eyebrow">Pricing</div>
        <h1 className="page-headline">Free to start. Scale when you need to.</h1>
      </section>

      <section className="pricing-section">
        <div className="pricing-grid">

          {/* FREE */}
          <div className="price-card">
            <div className="plan-name">Free</div>
            <div className="plan-price">
              <span className="price-amount">$0</span>
              <span className="price-period">/ forever</span>
            </div>
            <div className="price-alt">No credit card required</div>
            <ul className="features-list">
              <li><span className="feature-dot"></span>1 resume upload</li>
              <li><span className="feature-dot"></span>Up to 20 modules in your library</li>
              <li><span className="feature-dot"></span>2 tailored resumes per month</li>
              <li><span className="feature-dot"></span>$4 per additional resume</li>
              <li><span className="feature-dot"></span>DOCX + PDF download (24-hour link)</li>
              <li><span className="feature-dot"></span>Paste JD input</li>
            </ul>
            <Link href="/signin" className="btn-secondary" style={{ textDecoration: 'none' }}>Get started free</Link>
          </div>

          {/* STARTER */}
          <div className="price-card starter">
            <div className="plan-name">Starter</div>
            <div className="plan-price">
              <span className="price-amount">$29</span>
              <span className="price-period">/ month</span>
            </div>
            <div className="price-alt"><s>$348/year</s> &nbsp;<strong>$289/year — save $59</strong></div>
            <ul className="features-list">
              <li><span className="feature-dot"></span>3 resume uploads</li>
              <li><span className="feature-dot"></span>Up to 50 modules in your library</li>
              <li><span className="feature-dot"></span>15 tailored resumes per month</li>
              <li><span className="feature-dot"></span>Permanent file storage</li>
              <li><span className="feature-dot"></span>Cover letter generation</li>
              <li><span className="feature-dot"></span>Save job descriptions</li>
              <li><span className="feature-dot"></span>60-day generation history</li>
            </ul>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleUpgrade('starter', 'monthly')}
              disabled={starterLoading}
              style={{ cursor: starterLoading ? 'default' : 'pointer', opacity: starterLoading ? 0.7 : 1 }}
            >
              {starterLoading ? <><Spinner />Starting checkout…</> : 'Start for $29/mo'}
            </button>
          </div>

          {/* PRO */}
          <div className="price-card pro">
            <div className="popular-badge">Most Popular</div>
            <div className="plan-name">Pro</div>
            <div className="plan-price">
              <span className="price-amount">$40</span>
              <span className="price-period">/ month</span>
            </div>
            <div className="price-alt"><s>$480/year</s> &nbsp;<strong>$399/year — save $81</strong></div>
            <ul className="features-list">
              <li><span className="feature-dot"></span>Unlimited resume uploads</li>
              <li><span className="feature-dot"></span>Unlimited modules</li>
              <li><span className="feature-dot"></span>Unlimited tailored resumes</li>
              <li><span className="feature-dot"></span>Permanent file storage</li>
              <li><span className="feature-dot"></span>Cover letter generation</li>
              <li><span className="feature-dot"></span>Save job descriptions</li>
              <li><span className="feature-dot"></span>Full generation history</li>
              <li><span className="feature-dot"></span>Faster AI generation</li>
              <li><span className="feature-dot"></span>Priority generation</li>
              <li><span className="feature-dot"></span>Early access to new features</li>
            </ul>
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleUpgrade('pro', 'monthly')}
              disabled={proLoading}
              style={{ cursor: proLoading ? 'default' : 'pointer', opacity: proLoading ? 0.7 : 1 }}
            >
              {proLoading ? <><Spinner />Starting checkout…</> : 'Start Pro free for 7 days'}
            </button>
          </div>

        </div>
      </section>

      <section className="faq-section">
        <h2 className="section-headline">Questions about pricing</h2>
        <FaqItem question="Can I upgrade or downgrade later?" answer="Yes — any time. Your module library is fully preserved when you change plans. All modules, edits, and settings carry over automatically." />
        <FaqItem question="What happens to my files if I downgrade?" answer="Files are archived for 30 days after a downgrade. You can re-download any previously generated resumes during that window. After 30 days, stored files are removed — but your modules always remain." />
        <FaqItem question="What's the difference between Starter and Pro?" answer="Starter is great if you're actively job searching but don't need unlimited volume. Pro unlocks unlimited everything — uploads, modules, resumes — plus priority generation, URL imports, full history, and early access to new features." />
        <FaqItem question="Is there a team plan?" answer="Coming soon — join the waitlist and we'll let you know when team accounts are available. Team plans will include shared module libraries and manager visibility into team output." />
        <FaqItem question="Do you offer refunds?" answer="If you're not satisfied within the first 7 days of a paid plan, we'll refund you — no questions asked. Email support@modulehire.com." />
      </section>

      <PublicFooter />
    </>
  );
}
