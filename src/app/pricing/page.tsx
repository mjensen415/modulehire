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
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [proInterval, setProInterval] = useState<'monthly' | 'annual'>('monthly')

  async function postCheckout(key: string, body: Record<string, unknown>) {
    setLoading(prev => ({ ...prev, [key]: true }))
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 401) {
        window.location.href = '/signin?next=/pricing'
        return
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      if (data.url) window.location.href = data.url
    } catch (e) {
      alert((e as Error).message ?? 'Could not start checkout.')
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  function handleOneTime(product: 'single' | 'pack') {
    return postCheckout(`product-${product}`, { product })
  }

  function handleUpgrade(plan: 'pro', interval: 'monthly' | 'annual') {
    return postCheckout(`${plan}-${interval}`, { plan, interval })
  }

  const singleLoading = !!loading['product-single']
  const packLoading = !!loading['product-pack']
  const proLoading = !!loading[`pro-${proInterval}`]

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
        {/* ROW 1 — Free */}
        <div className="pricing-grid" style={{ marginBottom: 24 }}>
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
              <li><span className="feature-dot"></span>DOCX + PDF download</li>
              <li><span className="feature-dot"></span>Paste JD input</li>
            </ul>
            <Link href="/signin" className="btn-secondary" style={{ textDecoration: 'none' }}>Get started free</Link>
          </div>
        </div>

        {/* ROW 2 — One-time purchases */}
        <div className="pricing-grid" style={{ marginBottom: 24 }}>
          <div className="price-card">
            <div className="plan-name">Single Resume</div>
            <div className="plan-price">
              <span className="price-amount">$9</span>
              <span className="price-period">one-time</span>
            </div>
            <div className="price-alt">One credit, no subscription</div>
            <ul className="features-list">
              <li><span className="feature-dot"></span>1 tailored resume</li>
              <li><span className="feature-dot"></span>All 6 formats (PDF + DOCX)</li>
              <li><span className="feature-dot"></span>Credits never expire</li>
              <li><span className="feature-dot"></span>Full ATS optimization</li>
            </ul>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleOneTime('single')}
              disabled={singleLoading}
              style={{ cursor: singleLoading ? 'default' : 'pointer', opacity: singleLoading ? 0.7 : 1 }}
            >
              {singleLoading ? <><Spinner />Starting checkout…</> : 'Buy one resume'}
            </button>
          </div>

          <div className="price-card">
            <div className="popular-badge">Best value</div>
            <div className="plan-name">5-Pack</div>
            <div className="plan-price">
              <span className="price-amount">$29</span>
              <span className="price-period">one-time</span>
            </div>
            <div className="price-alt">~$5.80 per resume</div>
            <ul className="features-list">
              <li><span className="feature-dot"></span>5 tailored resumes</li>
              <li><span className="feature-dot"></span>All 6 formats (PDF + DOCX)</li>
              <li><span className="feature-dot"></span>Credits never expire</li>
              <li><span className="feature-dot"></span>Full ATS optimization</li>
              <li><span className="feature-dot"></span>Save $16 vs single</li>
            </ul>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleOneTime('pack')}
              disabled={packLoading}
              style={{ cursor: packLoading ? 'default' : 'pointer', opacity: packLoading ? 0.7 : 1 }}
            >
              {packLoading ? <><Spinner />Starting checkout…</> : 'Buy 5-pack'}
            </button>
          </div>
        </div>

        {/* ROW 3 — Pro subscription */}
        <div className="pricing-grid">
          <div className="price-card pro" style={{ gridColumn: '1 / -1' }}>
            <div className="popular-badge">Most popular</div>
            <div className="plan-name">Pro</div>
            <div className="plan-price">
              <span className="price-amount">{proInterval === 'monthly' ? '$19' : '$99'}</span>
              <span className="price-period">{proInterval === 'monthly' ? '/ month' : '/ year'}</span>
            </div>
            <div className="price-alt" style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setProInterval('monthly')}
                className={proInterval === 'monthly' ? 'btn-primary' : 'btn-ghost'}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setProInterval('annual')}
                className={proInterval === 'annual' ? 'btn-primary' : 'btn-ghost'}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                Annual <strong style={{ marginLeft: 4 }}>save $29</strong>
              </button>
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
              onClick={() => handleUpgrade('pro', proInterval)}
              disabled={proLoading}
              style={{ cursor: proLoading ? 'default' : 'pointer', opacity: proLoading ? 0.7 : 1 }}
            >
              {proLoading ? <><Spinner />Starting checkout…</> : 'Start Pro'}
            </button>
          </div>
        </div>
      </section>

      <section className="faq-section">
        <h2 className="section-headline">Questions about pricing</h2>
        <FaqItem question="Do resume credits expire?" answer="No — credits from single and pack purchases never expire. Use them whenever you're ready." />
        <FaqItem question="Can I mix credits and a subscription?" answer="Yes. If you have credits and upgrade to Pro, your credits stay in your account." />
        <FaqItem question="Can I upgrade or downgrade later?" answer="Yes — any time. Your module library is fully preserved when you change plans. All modules, edits, and settings carry over automatically." />
        <FaqItem question="What happens to my files if I downgrade?" answer="Files are archived for 30 days after a downgrade. You can re-download any previously generated resumes during that window. After 30 days, stored files are removed — but your modules always remain." />
        <FaqItem question="Is there a team plan?" answer="Coming soon — join the waitlist and we'll let you know when team accounts are available. Team plans will include shared module libraries and manager visibility into team output." />
        <FaqItem question="Do you offer refunds?" answer="If you're not satisfied within the first 7 days of a paid plan, we'll refund you — no questions asked. Email support@modulehire.com." />
      </section>

      <PublicFooter />
    </>
  );
}
