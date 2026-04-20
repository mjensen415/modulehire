import Link from 'next/link';
import PublicNav from '@/components/layout/PublicNav';
import PublicFooter from '@/components/layout/PublicFooter';
import FaqItem from '@/components/ui/FaqItem';

export default function Pricing() {
  return (
    <>
      <PublicNav />

      <section className="page-hero">
        <div className="hero-glow"></div>
        <div className="eyebrow">Pricing</div>
        <h1 className="page-headline">Free to start. Pro when you're serious.</h1>
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
            <div className="price-alt">&nbsp;</div>
            <ul className="features-list">
              <li><span className="feature-dot"></span>1 resume upload</li>
              <li><span className="feature-dot"></span>Up to 20 modules in your library</li>
              <li><span className="feature-dot"></span>3 generated resumes per month</li>
              <li><span className="feature-dot"></span>DOCX + PDF download (24-hour link)</li>
              <li><span className="feature-dot"></span>Paste JD input</li>
            </ul>
            <Link href="/signin" className="btn-secondary" style={{ textDecoration: 'none' }}>Get started free</Link>
          </div>

          {/* PRO */}
          <div className="price-card pro">
            <div className="popular-badge">Most Popular</div>
            <div className="plan-name">Pro</div>
            <div className="plan-price">
              <span className="price-amount">$12</span>
              <span className="price-period">/ month</span>
            </div>
            <div className="price-alt"><s>$144/year</s> &nbsp;<strong>$99/year — save $45</strong></div>
            <ul className="features-list">
              <li><span className="feature-dot"></span>Unlimited resume uploads</li>
              <li><span className="feature-dot"></span>Unlimited modules</li>
              <li><span className="feature-dot"></span>Unlimited generated resumes</li>
              <li><span className="feature-dot"></span>Permanent file storage (source + generated)</li>
              <li><span className="feature-dot"></span>Full generation history</li>
              <li><span className="feature-dot"></span>JD input via URL + file upload</li>
              <li><span className="feature-dot"></span>Priority generation</li>
              <li><span className="feature-dot"></span>Early access to new features</li>
            </ul>
            <Link href="/signin" className="btn-primary" style={{ textDecoration: 'none' }}>Start Pro free for 7 days</Link>
          </div>
        </div>
      </section>

      <section className="faq-section">
        <h2 className="section-headline">Questions about pricing</h2>
        <FaqItem question="Can I upgrade later?" answer="Yes — any time. Your free library is fully preserved when you upgrade. All modules, edits, and settings carry over automatically." />
        <FaqItem question="What happens to my files if I downgrade?" answer="Files are archived for 30 days after a downgrade. You can re-download any previously generated resumes during that window. After 30 days, stored files are removed — but your modules remain." />
        <FaqItem question="Is there a team plan?" answer="Coming soon — join the waitlist and we'll let you know when team accounts are available. Team plans will include shared module libraries and manager visibility into team output." />
      </section>

      <PublicFooter />
    </>
  );
}
