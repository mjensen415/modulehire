import Link from 'next/link'
import PublicNav from '@/components/layout/PublicNav'
import PublicFooter from '@/components/layout/PublicFooter'

export const metadata = {
  title: 'Terms of Service — ModuleHire',
  description: 'The terms governing your use of the ModuleHire service.',
}

const EFFECTIVE_DATE = 'June 30, 2026'
const CONTACT_EMAIL = 'legal@modulehire.com'

export default function TermsPage() {
  return (
    <>
      <PublicNav />
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px 96px' }}>

        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>
            Effective {EFFECTIVE_DATE}
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.5px', margin: '0 0 16px' }}>
            Terms of Service
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text2)', lineHeight: 1.7, margin: 0 }}>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your use of ModuleHire, operated by ModuleHire Labs
            (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By creating an account or using the service, you agree to these Terms.
            If you do not agree, do not use the service.
          </p>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 40, display: 'flex', flexDirection: 'column', gap: 40 }}>

          <section>
            <h2 style={h2}>1. The service</h2>
            <p style={p}>ModuleHire is a resume generation tool that helps you build a library of reusable skills and experience modules from your existing resume and generate tailored resumes for specific job applications.</p>
            <p style={p}>The service is currently in private beta. Features, pricing, and availability may change at any time during this period. We will do our best to communicate significant changes in advance.</p>
          </section>

          <section>
            <h2 style={h2}>2. Eligibility</h2>
            <p style={p}>You must be at least 13 years old to use ModuleHire. By using the service, you represent that you meet this requirement and that all information you provide is accurate.</p>
            <p style={p}>During the private beta, access requires a valid invite code. Invite codes are non-transferable and single-use.</p>
          </section>

          <section>
            <h2 style={h2}>3. Your account</h2>
            <p style={p}>You are responsible for maintaining the security of your account credentials and for all activity that occurs under your account. Notify us immediately at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>{CONTACT_EMAIL}</a>{' '}
              if you believe your account has been compromised.
            </p>
            <p style={p}>You may not share your account with others or create accounts on behalf of someone else without their consent.</p>
          </section>

          <section>
            <h2 style={h2}>4. Your content</h2>
            <p style={p}>You retain ownership of all content you upload to ModuleHire, including resumes, job descriptions, and any other materials (&ldquo;Your Content&rdquo;).</p>
            <p style={p}>By uploading content, you grant ModuleHire Labs a limited license to process, store, and use Your Content solely for the purpose of providing the service to you. We do not use your resume data or job descriptions to train AI models for other users or for any purpose outside of generating your own resumes.</p>
            <p style={p}>You are responsible for ensuring that Your Content does not infringe the rights of any third party and that you have the right to upload it.</p>
          </section>

          <section>
            <h2 style={h2}>5. Acceptable use</h2>
            <p style={p}>You agree not to:</p>
            <ul style={ul}>
              <li style={li}>Use the service to generate false, misleading, or fraudulent resumes</li>
              <li style={li}>Attempt to gain unauthorized access to other users&rsquo; accounts or data</li>
              <li style={li}>Reverse engineer, scrape, or copy the service or its underlying systems</li>
              <li style={li}>Use the service in a way that violates any applicable law or regulation</li>
              <li style={li}>Abuse, harass, or harm other users or members of our team</li>
              <li style={li}>Attempt to circumvent usage limits or billing</li>
            </ul>
            <p style={p}>We reserve the right to suspend or terminate accounts that violate these terms.</p>
          </section>

          <section>
            <h2 style={h2}>6. AI-generated content</h2>
            <p style={p}>ModuleHire uses AI to parse resumes, suggest modules, and generate resume text. AI output may contain errors, omissions, or content that does not accurately reflect your experience. You are responsible for reviewing all generated content before submitting it to employers.</p>
            <p style={p}>ATS Estimator scores and keyword match estimates are approximations. Different applicant tracking systems behave differently and actual results may vary. We make no guarantee that using ModuleHire will result in interview requests or job offers.</p>
          </section>

          <section>
            <h2 style={h2}>7. Billing and subscriptions</h2>
            <p style={p}>Some features of ModuleHire require a paid subscription. Subscriptions are billed in advance on a monthly or annual basis depending on the plan you select.</p>
            <p style={p}>You may cancel your subscription at any time. Cancellation takes effect at the end of your current billing period. We do not offer refunds for partial billing periods except where required by law.</p>
            <p style={p}>We reserve the right to change our pricing with at least 30 days notice. If you do not agree to a price change, you may cancel before the new price takes effect.</p>
          </section>

          <section>
            <h2 style={h2}>8. Intellectual property</h2>
            <p style={p}>The ModuleHire service, including its design, code, and branding, is owned by ModuleHire Labs and protected by applicable intellectual property laws. Nothing in these Terms transfers ownership of any ModuleHire intellectual property to you.</p>
            <p style={p}>You may not use the ModuleHire name, logo, or branding without our prior written consent.</p>
          </section>

          <section>
            <h2 style={h2}>9. Disclaimers</h2>
            <p style={p}>The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, either express or implied. We do not warrant that the service will be uninterrupted, error-free, or free of viruses or other harmful components.</p>
            <p style={p}>We are not responsible for the content of job postings you import, the decisions of employers, or the outcome of any job application you submit using content generated by ModuleHire.</p>
          </section>

          <section>
            <h2 style={h2}>10. Limitation of liability</h2>
            <p style={p}>To the fullest extent permitted by law, ModuleHire Labs will not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the service.</p>
            <p style={p}>Our total liability to you for any claim arising out of these Terms or your use of the service will not exceed the amount you paid us in the 12 months preceding the claim.</p>
          </section>

          <section>
            <h2 style={h2}>11. Termination</h2>
            <p style={p}>You may close your account at any time from your account settings. We may suspend or terminate your access if you violate these Terms or if we decide to discontinue the service, with reasonable notice where possible.</p>
            <p style={p}>Upon termination, your right to use the service ends. We will delete your data in accordance with our{' '}
              <Link href="/privacy" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Privacy Policy</Link>.
            </p>
          </section>

          <section>
            <h2 style={h2}>12. Changes to these terms</h2>
            <p style={p}>We may update these Terms from time to time. When we make material changes, we will notify you by email or with a notice in the app at least 14 days before the changes take effect. Continued use of the service after that date constitutes acceptance of the updated Terms.</p>
          </section>

          <section>
            <h2 style={h2}>13. Governing law</h2>
            <p style={p}>These Terms are governed by the laws of the State of California, without regard to its conflict of law provisions. Any disputes arising under these Terms will be resolved in the courts of San Francisco County, California.</p>
          </section>

          <section>
            <h2 style={h2}>14. Contact</h2>
            <p style={p}>Questions about these Terms can be sent to{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>{CONTACT_EMAIL}</a>.
            </p>
            <p style={{ ...p, marginTop: 8 }}>
              ModuleHire Labs<br />
              <a href="https://modulehire.com" style={{ color: 'var(--teal)', textDecoration: 'none' }}>modulehire.com</a>
            </p>
          </section>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24, display: 'flex', gap: 24 }}>
            <Link href="/privacy" style={{ fontSize: 14, color: 'var(--teal)', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link href="/" style={{ fontSize: 14, color: 'var(--text3)', textDecoration: 'none' }}>Back to home</Link>
          </div>

        </div>
      </main>
      <PublicFooter />
    </>
  )
}

const h2: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: 'var(--text)',
  letterSpacing: '-0.3px',
  margin: '0 0 12px',
}

const h3: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--text)',
  margin: '20px 0 8px',
}

const p: React.CSSProperties = {
  fontSize: 15,
  color: 'var(--text2)',
  lineHeight: 1.75,
  margin: '0 0 12px',
}

const ul: React.CSSProperties = {
  margin: '0 0 12px',
  paddingLeft: 20,
}

const li: React.CSSProperties = {
  fontSize: 15,
  color: 'var(--text2)',
  lineHeight: 1.75,
  marginBottom: 4,
}
