import Link from 'next/link'
import PublicNav from '@/components/layout/PublicNav'
import PublicFooter from '@/components/layout/PublicFooter'

export const metadata = {
  title: 'Privacy Policy — ModuleHire',
  description: 'How ModuleHire collects, uses, and protects your personal information.',
}

const EFFECTIVE_DATE = 'June 30, 2026'
const CONTACT_EMAIL = 'privacy@modulehire.com'

export default function PrivacyPage() {
  return (
    <>
      <PublicNav />
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px 96px' }}>

        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>
            Effective {EFFECTIVE_DATE}
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.5px', margin: '0 0 16px' }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text2)', lineHeight: 1.7, margin: 0 }}>
            ModuleHire Labs (&ldquo;ModuleHire,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the ModuleHire service at{' '}
            <a href="https://modulehire.com" style={{ color: 'var(--teal)', textDecoration: 'none' }}>modulehire.com</a>.
            This policy explains what information we collect, how we use it, and your rights.
          </p>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 40, display: 'flex', flexDirection: 'column', gap: 40 }}>

          <section>
            <h2 style={h2}>1. Information we collect</h2>
            <p style={p}>We collect information you provide directly and information generated through your use of the service.</p>
            <h3 style={h3}>Account information</h3>
            <p style={p}>When you create an account, we collect your email address and password (stored as a secure hash). If you sign in with Google or LinkedIn, we receive your name, email address, and profile photo from that provider.</p>
            <h3 style={h3}>Resume and career data</h3>
            <p style={p}>When you upload a resume, we store the extracted text and the skills, experience modules, and job history we parse from it. This data is the core of your module library and is used to generate tailored resumes on your behalf.</p>
            <h3 style={h3}>Job descriptions</h3>
            <p style={p}>We store the job descriptions you paste or import so we can match them against your module library and generate relevant resumes.</p>
            <h3 style={h3}>Usage data</h3>
            <p style={p}>We collect information about how you use the service, including pages visited, features used, and actions taken. This helps us understand what is working and what needs improvement.</p>
            <h3 style={h3}>Feedback</h3>
            <p style={p}>If you submit feedback through the in-app widget, we store your message, rating, and the page you were on when you submitted it.</p>
            <h3 style={h3}>Payment information</h3>
            <p style={p}>Payments are processed by Stripe. We do not store your credit card number or payment details. Stripe provides us with a token and basic transaction information.</p>
          </section>

          <section>
            <h2 style={h2}>2. How we use your information</h2>
            <p style={p}>We use the information we collect to:</p>
            <ul style={ul}>
              <li style={li}>Provide, operate, and improve the ModuleHire service</li>
              <li style={li}>Generate tailored resumes on your behalf</li>
              <li style={li}>Send transactional emails such as account confirmations and password resets</li>
              <li style={li}>Send product updates and announcements if you opted in during signup</li>
              <li style={li}>Detect and prevent fraud, abuse, and security incidents</li>
              <li style={li}>Respond to your support requests and feedback</li>
              <li style={li}>Comply with legal obligations</li>
            </ul>
            <p style={p}>We do not sell your personal information. We do not use your resume data to train AI models for any purpose other than generating your own resumes.</p>
          </section>

          <section>
            <h2 style={h2}>3. How we share your information</h2>
            <p style={p}>We do not sell or rent your personal information. We share information only in the following circumstances:</p>
            <h3 style={h3}>Service providers</h3>
            <p style={p}>We use third-party services to operate the platform, including Supabase (database and authentication), Vercel (hosting), Stripe (payments), Anthropic (AI processing), and Brevo (email delivery). These providers process data only as necessary to provide their services to us.</p>
            <h3 style={h3}>Legal requirements</h3>
            <p style={p}>We may disclose information if required to do so by law or in response to valid legal process.</p>
            <h3 style={h3}>Business transfers</h3>
            <p style={p}>If ModuleHire Labs is acquired or merges with another company, your information may be transferred as part of that transaction. We will notify you before that happens.</p>
          </section>

          <section>
            <h2 style={h2}>4. Data storage and security</h2>
            <p style={p}>Your data is stored on Supabase infrastructure. We use row-level security to ensure you can only access your own data. Passwords are hashed and never stored in plain text. All data is transmitted over HTTPS.</p>
            <p style={p}>No system is perfectly secure. We take reasonable steps to protect your information but cannot guarantee absolute security.</p>
          </section>

          <section>
            <h2 style={h2}>5. Data retention</h2>
            <p style={p}>We retain your account data for as long as your account is active. If you delete your account, we delete your personal information within 30 days, except where we are required to retain it for legal or financial compliance purposes.</p>
          </section>

          <section>
            <h2 style={h2}>6. Your rights</h2>
            <p style={p}>Depending on where you are located, you may have the right to:</p>
            <ul style={ul}>
              <li style={li}>Access the personal information we hold about you</li>
              <li style={li}>Correct inaccurate information</li>
              <li style={li}>Request deletion of your data</li>
              <li style={li}>Export your data in a portable format</li>
              <li style={li}>Object to or restrict certain processing</li>
              <li style={li}>Withdraw consent for marketing communications at any time</li>
            </ul>
            <p style={p}>To exercise any of these rights, email us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>{CONTACT_EMAIL}</a>.
            </p>
          </section>

          <section>
            <h2 style={h2}>7. Cookies</h2>
            <p style={p}>We use cookies and similar technologies to maintain your session, remember your preferences, and understand how the service is being used. We do not use third-party advertising cookies.</p>
          </section>

          <section>
            <h2 style={h2}>8. Children</h2>
            <p style={p}>ModuleHire is not directed at children under 13. We do not knowingly collect personal information from children. If you believe we have inadvertently collected such information, contact us and we will delete it promptly.</p>
          </section>

          <section>
            <h2 style={h2}>9. Changes to this policy</h2>
            <p style={p}>We may update this policy from time to time. When we make material changes, we will notify you by email or with a notice in the app before the changes take effect. The effective date at the top of this page reflects the most recent revision.</p>
          </section>

          <section>
            <h2 style={h2}>10. Contact</h2>
            <p style={p}>If you have questions about this policy or how we handle your data, contact us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>{CONTACT_EMAIL}</a>.
            </p>
            <p style={{ ...p, marginTop: 8 }}>
              ModuleHire Labs<br />
              <a href="https://modulehire.com" style={{ color: 'var(--teal)', textDecoration: 'none' }}>modulehire.com</a>
            </p>
          </section>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24, display: 'flex', gap: 24 }}>
            <Link href="/terms" style={{ fontSize: 14, color: 'var(--teal)', textDecoration: 'none' }}>Terms of Service</Link>
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
