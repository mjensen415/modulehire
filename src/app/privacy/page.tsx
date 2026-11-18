import Link from 'next/link'
import PublicNav from '@/components/layout/PublicNav'
import PublicFooter from '@/components/layout/PublicFooter'

export const metadata = {
  title: 'Privacy Policy — ModuleHire',
  description: 'How ModuleHire collects, uses, and protects your personal information.',
}

const EFFECTIVE_DATE = 'November 18, 2026'
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
            <p style={p}>We use third-party services to operate the platform, including Supabase (database and authentication), Vercel (hosting), Stripe (payments), Anthropic (AI processing), ElevenLabs (voice processing for mock interviews), and Brevo (email delivery). These providers process data only as necessary to provide their services to us.</p>
            <h3 style={h3}>AI apps you connect</h3>
            <p style={p}>If you connect an AI app to your ModuleHire account (see section 4), we send that app the information it asks for when it uses a ModuleHire tool on your behalf. You choose which apps to connect and can disconnect them at any time.</p>
            <h3 style={h3}>Legal requirements</h3>
            <p style={p}>We may disclose information if required to do so by law or in response to valid legal process.</p>
            <h3 style={h3}>Business transfers</h3>
            <p style={p}>If ModuleHire Labs is acquired or merges with another company, your information may be transferred as part of that transaction. We will notify you before that happens.</p>
          </section>

          <section>
            <h2 style={h2}>4. AI apps you connect (MCP)</h2>
            <p style={p}>You can connect AI apps such as Claude, ChatGPT, and Cursor to your ModuleHire account through our Model Context Protocol (MCP) server. This section explains what that connection allows.</p>
            <h3 style={h3}>How you connect</h3>
            <p style={p}>You approve each app on modulehire.com while signed in. The app receives an access token that lets it use ModuleHire tools as you. It never receives your password.</p>
            <h3 style={h3}>What a connected app can access</h3>
            <p style={p}>A connected app can read your skill modules, work history, the job descriptions you analyzed and their match results, your resumes (including the contact details on them), your job applications, and your plan and usage. At your request it can also make changes: add modules to your library, edit and generate resumes, create download links, and update your job tracker. Generating a resume counts toward your plan&rsquo;s monthly limit, the same as on the website.</p>
            <h3 style={h3}>When data is shared</h3>
            <p style={p}>We send data to a connected app only when it calls a ModuleHire tool, which typically happens when you ask it for something that needs your ModuleHire data. We do not send data to the app at any other time.</p>
            <h3 style={h3}>What happens to it there</h3>
            <p style={p}>Once a connected app receives your data, the app&rsquo;s provider (for example Anthropic for Claude or OpenAI for ChatGPT) handles it under its own terms and privacy policy. We do not control how those providers store or use it.</p>
            <h3 style={h3}>What we record</h3>
            <p style={p}>For each tool call we record which tool was used, which app made the call, whether it succeeded, and how long it took. This is kept with the rest of your usage data (see section 7). One-click editor links are stored only as a one-way hash and expire after 5 minutes. Files you export through a connected app are stored temporarily so the download link works; the link expires after 10 minutes.</p>
            <h3 style={h3}>Disconnecting</h3>
            <p style={p}>To disconnect an app, go to Account, then Connected accounts, and choose Disconnect under AI apps. The app&rsquo;s access ends immediately. You can also remove ModuleHire from the app&rsquo;s own settings. Disconnecting does not delete data the app already received; ask the app&rsquo;s provider if you want that removed.</p>
          </section>

          <section id="voice">
            <h2 style={h2}>5. Voice mock interviews</h2>
            <p style={p}>Pro members can practice interviews out loud with an AI interviewer. This section explains what happens to your voice and what we keep.</p>
            <h3 style={h3}>Consent</h3>
            <p style={p}>Before your first session we ask you to confirm that you understand you are talking to an AI, and that your voice will be recorded and processed to run the conversation. We record when you agreed and to which version of this notice. A session does not start without it.</p>
            <h3 style={h3}>What we send and to whom</h3>
            <p style={p}>The conversation runs on ElevenLabs. While a session is live, your microphone audio goes to ElevenLabs to be transcribed and answered. To tailor the interview we also send your first name, the job title, company and key requirements of the job you picked, and short excerpts of your confirmed skill modules. ElevenLabs handles this data as our service provider under its own terms.</p>
            <h3 style={h3}>What we keep</h3>
            <p style={p}>ModuleHire does not store audio. After the session we save the text transcript and the written feedback to your account so you can review them. We use them only to show you your results. We do not use your voice to create a voice clone or a voiceprint, and we do not use your transcripts to train AI models.</p>
            <h3 style={h3}>Deleting a session</h3>
            <p style={p}>You can delete any session from the voice interview page. That removes the transcript and feedback from ModuleHire and asks ElevenLabs to delete its copy of the conversation. Sessions you don&rsquo;t delete are kept until you delete them or your account (see section 7).</p>
            <h3 style={h3}>Funding</h3>
            <p style={p}>Voice interviews are supported by the ElevenLabs Grants program. ElevenLabs does not receive any of your data beyond what is described above.</p>
          </section>

          <section>
            <h2 style={h2}>6. Data storage and security</h2>
            <p style={p}>Your data is stored on Supabase infrastructure. We use row-level security to ensure you can only access your own data. Passwords are hashed and never stored in plain text. All data is transmitted over HTTPS.</p>
            <p style={p}>No system is perfectly secure. We take reasonable steps to protect your information but cannot guarantee absolute security.</p>
          </section>

          <section>
            <h2 style={h2}>7. Data retention</h2>
            <p style={p}>We retain your account data for as long as your account is active. If you delete your account, we delete your personal information within 30 days, except where we are required to retain it for legal or financial compliance purposes.</p>
          </section>

          <section>
            <h2 style={h2}>8. Your rights</h2>
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
            <h2 style={h2}>9. Cookies</h2>
            <p style={p}>We use cookies and similar technologies to maintain your session, remember your preferences, and understand how the service is being used. We do not use third-party advertising cookies.</p>
          </section>

          <section>
            <h2 style={h2}>10. Children</h2>
            <p style={p}>ModuleHire is not directed at children under 13. We do not knowingly collect personal information from children. If you believe we have inadvertently collected such information, contact us and we will delete it promptly.</p>
          </section>

          <section>
            <h2 style={h2}>11. Changes to this policy</h2>
            <p style={p}>We may update this policy from time to time. When we make material changes, we will notify you by email or with a notice in the app before the changes take effect. The effective date at the top of this page reflects the most recent revision.</p>
          </section>

          <section>
            <h2 style={h2}>12. Contact</h2>
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
