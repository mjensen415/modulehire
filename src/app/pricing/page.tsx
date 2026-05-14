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
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly')

  async function handleUpgrade(plan: 'pro', intervalArg: 'monthly' | 'annual') {
    const key = `${plan}-${intervalArg}`
    setUpgrading(prev => ({ ...prev, [key]: true }))
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, interval: intervalArg }),
      })
      if (res.status === 401) { window.location.href = '/signin?next=/pricing'; return }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      if (data.url) window.location.href = data.url
    } catch (e) {
      alert((e as Error).message ?? 'Could not start checkout.')
    } finally {
      setUpgrading(prev => ({ ...prev, [key]: false }))
    }
  }

  async function handleOneTime(product: 'single' | 'pack') {
    setUpgrading(prev => ({ ...prev, [product]: true }))
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product }),
      })
      if (res.status === 401) { window.location.href = '/signin?next=/pricing'; return }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      if (data.url) window.location.href = data.url
    } catch (e) {
      alert((e as Error).message ?? 'Could not start checkout.')
    } finally {
      setUpgrading(prev => ({ ...prev, [product]: false }))
    }
  }

  return (
    <>
      <PublicNav />

      <section className="page-hero">
        <div className="hero-glow"></div>
        <div className="eyebrow">Pricing</div>
        <h1 className="page-headline">Pay as you go, or go unlimited.</h1>
        <p style={{ color: 'var(--text2)', marginTop: 12 }}>No hidden fees. Credits don&apos;t expire.</p>
      </section>

      <section className="pricing-section">

        {/* FREE — full width horizontal banner */}
        <div className="price-card price-card-free">
          <div className="free-card-left">
            <div className="plan-name">Free</div>
            <div className="plan-price">
              <span className="price-amount">$0</span>
              <span className="price-period">/ forever</span>
            </div>
            <div className="price-alt">No credit card required</div>
            <Link href="/signin" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-block', marginTop: 12 }}>
              Get started free
            </Link>
          </div>
          <div className="free-card-divider" />
          <ul className="features-list free-features-grid">
            <li><span className="feature-dot"></span>Upload 1 resume</li>
            <li><span className="feature-dot"></span>Auto-parsed module library</li>
            <li><span className="feature-dot"></span>Up to 20 modules</li>
            <li><span className="feature-dot"></span>Full resume builder experience</li>
            <li><span className="feature-dot"></span>Preview your generated resume</li>
            <li><span className="feature-dot feature-dot-muted"></span>
              <span style={{ color: 'var(--text3)' }}>Download from $9 per resume</span>
            </li>
          </ul>
        </div>

        {/* PAID — 3 column grid */}
        <div className="pricing-grid">

          {/* SINGLE */}
          <div className="price-card">
            <div className="plan-name">Single resume</div>
            <div className="plan-price">
              <span className="price-amount">$9</span>
              <span className="price-period"> one-time</span>
            </div>
            <div className="price-alt">One credit, no subscription</div>
            <ul className="features-list">
              <li><span className="feature-dot"></span>1 tailored resume download</li>
              <li><span className="feature-dot"></span>All 6 formats (PDF + DOCX)</li>
              <li><span className="feature-dot"></span>Credits never expire</li>
              <li><span className="feature-dot"></span>Full ATS optimization</li>
            </ul>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleOneTime('single')}
              disabled={!!upgrading['single']}
              style={{ cursor: upgrading['single'] ? 'default' : 'pointer', opacity: upgrading['single'] ? 0.7 : 1 }}
            >
              {upgrading['single'] ? <><Spinner />Starting checkout…</> : 'Buy one resume'}
            </button>
          </div>

          {/* 5-PACK */}
          <div className="price-card">
            <div className="popular-badge" style={{ background: 'var(--teal)', color: '#fff' }}>Best value</div>
            <div className="plan-name">5-pack</div>
            <div className="plan-price">
              <span className="price-amount">$29</span>
              <span className="price-period"> one-time</span>
            </div>
            <div className="price-alt">~$5.80 per resume</div>
            <ul className="features-list">
              <li><span className="feature-dot"></span>5 tailored resume downloads</li>
              <li><span className="feature-dot"></span>All 6 formats (PDF + DOCX)</li>
              <li><span className="feature-dot"></span>Credits never expire</li>
              <li><span className="feature-dot"></span>Full ATS optimization</li>
              <li><span className="feature-dot"></span>Save $16 vs single</li>
            </ul>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleOneTime('pack')}
              disabled={!!upgrading['pack']}
              style={{ cursor: upgrading['pack'] ? 'default' : 'pointer', opacity: upgrading['pack'] ? 0.7 : 1 }}
            >
              {upgrading['pack'] ? <><Spinner />Starting checkout…</> : 'Buy 5-pack'}
            </button>
          </div>

          {/* PRO */}
          <div className="price-card pro">
            <div className="popular-badge">Most popular</div>
            <div className="plan-name">Pro</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setInterval('monthly')}
                className={interval === 'monthly' ? 'toggle-active' : 'toggle-inactive'}
              >Monthly</button>
              <button
                type="button"
                onClick={() => setInterval('annual')}
                className={interval === 'annual' ? 'toggle-active' : 'toggle-inactive'}
              >Annual <span style={{ color: 'var(--teal)', marginLeft: 2 }}>save $29</span></button>
            </div>
            <div className="plan-price">
              <span className="price-amount">{interval === 'monthly' ? '$19' : '$99'}</span>
              <span className="price-period">{interval === 'monthly' ? '/ month' : '/ year'}</span>
            </div>
            <div className="price-alt">
              {interval === 'monthly' ? '$99/year billed annually' : '~$8.25/month'}
            </div>
            <ul className="features-list">
              <li><span className="feature-dot"></span>Unlimited tailored resumes</li>
              <li><span className="feature-dot"></span>Unlimited resume uploads</li>
              <li><span className="feature-dot"></span>Unlimited module library</li>
              <li><span className="feature-dot"></span>All 6 formats (PDF + DOCX)</li>
              <li><span className="feature-dot"></span>Full ATS optimization + live score</li>
              <li><span className="feature-dot"></span>Full generation history</li>
              <li><span className="feature-dot"></span>Priority access to new features</li>
            </ul>
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleUpgrade('pro', interval)}
              disabled={!!upgrading[`pro-${interval}`]}
              style={{ cursor: upgrading[`pro-${interval}`] ? 'default' : 'pointer', opacity: upgrading[`pro-${interval}`] ? 0.7 : 1 }}
            >
              {upgrading[`pro-${interval}`] ? <><Spinner />Starting checkout…</> : 'Start Pro'}
            </button>
          </div>

        </div>
      </section>

      <section className="faq-section">
        <h2 className="section-headline">Questions about pricing</h2>
        <FaqItem question="Do credits expire?" answer="No. Credits from single and 5-pack purchases never expire. Use them whenever you're ready." />
        <FaqItem question="Can I preview before I pay?" answer="Yes — upload your resume, build your module library, and generate a full preview for free. You only pay when you're ready to download." />
        <FaqItem question="Can I mix credits and a subscription?" answer="Yes. Any unused credits stay in your account if you subscribe to Pro." />
        <FaqItem question="Can I upgrade or downgrade later?" answer="Yes — any time. Your module library is fully preserved when you change plans. All modules, edits, and settings carry over automatically." />
        <FaqItem question="Do you offer refunds?" answer="If you're not satisfied within the first 7 days of a paid plan, we'll refund you — no questions asked. Email support@modulehire.com." />
      </section>

      <PublicFooter />
    </>
  );
}
